import { argv } from "node:process";

import { createCodexClient, defaultThreadOptions, timestamp } from "./helpers.js";
import type { ReasoningItem, ThreadItem } from "@openai/codex-sdk";

const defaultPrompt =
  "Analyze this repository and propose 3 highest-impact engineering improvements with concise rationale.";

function collectReasoning(items: ThreadItem[]): string[] {
  return items
    .filter((item): item is ReasoningItem => item.type === "reasoning")
    .map((item) => item.text.trim())
    .filter((text) => text.length > 0);
}

async function main(): Promise<void> {
  const prompt = argv.slice(2).join(" ").trim() || defaultPrompt;

  const codex = createCodexClient();
  const thread = codex.startThread(defaultThreadOptions());

  console.log(`[${timestamp()}] Running basic worker...`);
  console.log(`Prompt: ${prompt}`);

  const { events } = await thread.runStreamed(prompt);

  const allItems: ThreadItem[] = [];
  let finalResponse = "";
  let usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null = null;

  for await (const event of events) {
    switch (event.type) {
      case "item.completed":
        allItems.push(event.item);
        if (event.item.type === "reasoning") {
          console.log(`  Reasoning: ${event.item.text}`);
        } else if (event.item.type === "command_execution") {
          console.log(`  Command: ${event.item.command} (${event.item.status}, exit ${event.item.exit_code ?? "?"})`);
        } else if (event.item.type === "agent_message") {
          finalResponse = event.item.text;
        }
        break;
      case "turn.completed":
        usage = event.usage;
        break;
      case "turn.failed":
        console.error(`\nTurn failed: ${event.error.message}`);
        break;
    }
  }

  console.log("\n=== BASIC WORKER RESULT ===");
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`Items emitted: ${allItems.length}`);
  if (usage) {
    console.log(
      `Usage: input=${usage.input_tokens}, cached=${usage.cached_input_tokens}, output=${usage.output_tokens}`,
    );
  }

  const reasoning = collectReasoning(allItems);
  if (reasoning.length === 0) {
    console.log("\nReasoning: (none returned for this run)");
  }

  console.log("\nAssistant response:");
  console.log(finalResponse);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Basic worker failed: ${message}`);
  process.exit(1);
});
