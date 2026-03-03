import { argv } from "node:process";

import { createCodexClient, defaultThreadOptions, timestamp } from "./helpers.js";

const defaultPrompt =
  "Analyze this repository and propose 3 highest-impact engineering improvements with concise rationale.";

async function main(): Promise<void> {
  const prompt = argv.slice(2).join(" ").trim() || defaultPrompt;

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
  console.log("\nAssistant response:");
  console.log(turn.finalResponse);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Basic worker failed: ${message}`);
  process.exit(1);
});

