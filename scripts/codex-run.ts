import { argv } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createCodexClient, ensureRuntimeDirs, paths, timestamp, trimForLog } from "./helpers.js";
import { Codex, type ThreadItem } from "@openai/codex-sdk";

const DEFAULT_INSTRUCTIONS_FILE = "pr-review-instructions.md";
const LAST_THREAD_FILE = `${paths.stateDir}/codex-run-thread-id.txt`;

function formatItemSummary(item: ThreadItem): string | null {
  switch (item.type) {
    case "reasoning":
      return `Reasoning: ${trimForLog(item.text, 180)}`;
    case "agent_message":
      return `Assistant: ${trimForLog(item.text, 200)}`;
    case "command_execution":
      return `Command: ${item.command} (${item.status}, exit ${item.exit_code ?? "?"})`;
    case "file_change":
      return `File change: ${item.changes.map((c) => `${c.kind} ${c.path}`).join(", ")}`;
    case "web_search":
      return `Web search: ${item.query}`;
    case "mcp_tool_call":
      return `MCP [${item.server}] ${item.tool}(${typeof item.arguments === "string" ? trimForLog(item.arguments, 120) : trimForLog(JSON.stringify(item.arguments), 120)}) — ${item.status}${item.error ? ` error: ${item.error.message}` : ""}`;
    case "todo_list":
      return `Todo: ${item.items.filter((t) => !t.completed).length} open`;
    default:
      return null;
  }
}

async function loadInstructions(): Promise<string | null> {
  const instructionsPath = process.env.PR_REVIEW_INSTRUCTIONS_FILE
    ?? path.join(process.cwd(), DEFAULT_INSTRUCTIONS_FILE);
  try {
    const content = await readFile(instructionsPath, "utf8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

async function loadLastThreadId(): Promise<string | null> {
  try {
    const raw = (await readFile(LAST_THREAD_FILE, "utf8")).trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

async function saveThreadId(id: string | null): Promise<void> {
  if (!id) return;
  await writeFile(LAST_THREAD_FILE, `${id}\n`, "utf8");
}

function extractFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || !args[idx + 1]) return null;
  const value = args[idx + 1];
  args.splice(idx, 2);
  return value;
}

function extractBoolFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

async function main(): Promise<void> {
  await ensureRuntimeDirs();

  const args = argv.slice(2);

  const workingDirectory = path.resolve(extractFlag(args, "--cwd") ?? process.cwd());
  const resumeFlag = extractBoolFlag(args, "--resume");
  const resumeId = extractFlag(args, "--thread");

  const prompt = args.join(" ").trim();
  if (!prompt) {
    console.error("Usage: npm run codex -- [--cwd /path] [--resume | --thread <id>] <prompt>");
    console.error("");
    console.error("Flags:");
    console.error("  --cwd <path>     Working directory for Codex (default: cwd)");
    console.error("  --resume         Continue the last thread automatically");
    console.error("  --thread <id>    Resume a specific thread by ID");
    console.error("");
    console.error("Examples:");
    console.error('  npm run codex -- --cwd ~/my-repo "Build this project"');
    console.error('  npm run codex -- --resume "Now run the tests too"');
    process.exit(1);
  }

  const instructions = await loadInstructions();

  const codex = new Codex({
    apiKey: process.env.CODEX_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
    config: {
      ...(process.env.CODEX_SHOW_RAW_AGENT_REASONING === "true"
        ? { show_raw_agent_reasoning: true }
        : {}),
      ...(instructions ? { developer_instructions: instructions } : {}),
    },
  });

  const threadOptions = {
    workingDirectory,
    skipGitRepoCheck: false,
    sandboxMode: "danger-full-access" as const,
    approvalPolicy: "never" as const,
    networkAccessEnabled: true,
    webSearchMode: "live" as const,
    webSearchEnabled: true,
  };

  let threadId = resumeId ?? (resumeFlag ? await loadLastThreadId() : null);
  const thread = threadId
    ? codex.resumeThread(threadId, threadOptions)
    : codex.startThread(threadOptions);

  console.log(`[${timestamp()}] Running Codex...`);
  console.log(`Working directory: ${workingDirectory}`);
  console.log(`Thread: ${threadId ? `resuming ${threadId}` : "new"}`);
  console.log(`Custom instructions: ${instructions ? "loaded" : "none"}`);
  console.log(`Prompt: ${prompt}\n`);

  const { events } = await thread.runStreamed(prompt);

  for await (const event of events) {
    switch (event.type) {
      case "item.completed": {
        const summary = formatItemSummary(event.item);
        if (summary) {
          console.log(`  ${summary}`);
        }
        break;
      }
      case "turn.completed":
        console.log(
          `\nUsage: input=${event.usage.input_tokens}, cached=${event.usage.cached_input_tokens}, output=${event.usage.output_tokens}`,
        );
        break;
      case "turn.failed":
        console.error(`\nTurn failed: ${event.error.message}`);
        break;
    }
  }

  await saveThreadId(thread.id);

  console.log(`\n=== DONE ===`);
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`To continue: npm run codex -- --resume "your follow-up prompt"`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Codex run failed: ${message}`);
  process.exit(1);
});
