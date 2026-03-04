import { argv } from "node:process";

import type { ThreadItem } from "@openai/codex-sdk";
import { createCodexClient, defaultThreadOptions, timestamp, trimForLog } from "./helpers.js";

const defaultPrompt =
  "Use live web search to find the latest stable Node.js LTS release and one notable change from its release notes. Return exactly 3 concise bullet points and include source URLs.";

function formatItemSummary(item: ThreadItem): string | null {
  switch (item.type) {
    case "web_search":
      return `Web search: ${item.query}`;
    case "reasoning":
      return `Reasoning: ${trimForLog(item.text, 180)}`;
    case "command_execution":
      return `Command: ${item.command} (${item.status}, exit ${item.exit_code ?? "?"})`;
    case "agent_message":
      return `Assistant: ${trimForLog(item.text, 180)}`;
    case "todo_list":
      return `Todo list updated: ${item.items.filter((todo) => !todo.completed).length} open`;
    case "error":
      return `Item error: ${item.message}`;
    default:
      return null;
  }
}

async function main(): Promise<void> {
  const prompt = argv.slice(2).join(" ").trim() || defaultPrompt;

  const codex = createCodexClient();
  const thread = codex.startThread(
    defaultThreadOptions({
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: true,
      webSearchMode: "live",
      webSearchEnabled: true,
    }),
  );

  console.log(`[${timestamp()}] Running web access demo...`);
  console.log(`Prompt: ${prompt}`);
  console.log("Thread options: network=true, webSearchMode=live, sandbox=read-only, approval=never\n");

  const { events } = await thread.runStreamed(prompt);

  let finalResponse = "";
  let webSearchCount = 0;

  for await (const event of events) {
    switch (event.type) {
      case "item.completed": {
        if (event.item.type === "agent_message") {
          finalResponse = event.item.text;
        }
        if (event.item.type === "web_search") {
          webSearchCount += 1;
        }
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
      case "error":
        console.error(`\nStream error: ${event.message}`);
        break;
    }
  }

  console.log(`\n=== WEB ACCESS DEMO COMPLETE ===`);
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`Web searches executed: ${webSearchCount}`);
  if (webSearchCount === 0) {
    console.log("Note: no explicit web_search item was returned for this run.");
  }
  console.log("\nAssistant response:");
  console.log(finalResponse || "(no assistant response captured)");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Web access demo failed: ${message}`);
  process.exit(1);
});
