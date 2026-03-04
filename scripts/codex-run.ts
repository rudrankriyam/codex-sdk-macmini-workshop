import { argv } from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCodexClient, timestamp, trimForLog } from "./helpers.js";
import { Codex, type ThreadItem } from "@openai/codex-sdk";

const DEFAULT_INSTRUCTIONS_FILE = "pr-review-instructions.md";

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

async function main(): Promise<void> {
  const args = argv.slice(2);
  const cwdFlagIndex = args.indexOf("--cwd");
  let workingDirectory = process.cwd();

  if (cwdFlagIndex !== -1 && args[cwdFlagIndex + 1]) {
    workingDirectory = path.resolve(args[cwdFlagIndex + 1]);
    args.splice(cwdFlagIndex, 2);
  }

  const prompt = args.join(" ").trim();
  if (!prompt) {
    console.error("Usage: npm run codex -- [--cwd /path/to/repo] <prompt>");
    console.error('Example: npm run codex -- --cwd ~/Developer/Apps/Foundation-Models-Framework-Example "Check out PR #108, build, test, and post results on the PR"');
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

  const thread = codex.startThread({
    workingDirectory,
    skipGitRepoCheck: false,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
    webSearchMode: "live",
    webSearchEnabled: true,
  });

  console.log(`[${timestamp()}] Running Codex...`);
  console.log(`Working directory: ${workingDirectory}`);
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

  console.log(`\n=== DONE ===`);
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Codex run failed: ${message}`);
  process.exit(1);
});
