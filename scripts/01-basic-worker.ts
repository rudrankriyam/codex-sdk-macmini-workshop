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
  const rawReasoningEnabled = process.env.CODEX_SHOW_RAW_AGENT_REASONING === "true";

  const codex = createCodexClient();
  const thread = codex.startThread(defaultThreadOptions());

  console.log(`[${timestamp()}] Running basic worker...`);
  console.log(`Prompt: ${prompt}`);

  const turn = await thread.run(prompt);

  console.log("\n=== BASIC WORKER RESULT ===");
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`Items emitted: ${turn.items.length}`);
  if (turn.usage) {
    console.log(
      `Usage: input=${turn.usage.input_tokens}, cached=${turn.usage.cached_input_tokens}, output=${turn.usage.output_tokens}`,
    );
  }
  const reasoning = collectReasoning(turn.items);
  if (reasoning.length > 0) {
    console.log("\nReasoning:");
    reasoning.forEach((step, index) => {
      console.log(`${index + 1}. ${step}`);
    });
  } else {
    console.log(
      rawReasoningEnabled
        ? "\nReasoning: (none returned for this run)"
        : "\nReasoning: (disabled by default; set CODEX_SHOW_RAW_AGENT_REASONING=true to request it)",
    );
  }
  console.log("\nAssistant response:");
  console.log(turn.finalResponse);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Basic worker failed: ${message}`);
  process.exit(1);
});

