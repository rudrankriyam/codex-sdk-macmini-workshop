import { argv } from "node:process";

import {
  createCodexClient,
  defaultThreadOptions,
  ensureRuntimeDirs,
  readSavedThreadId,
  saveThreadId,
  timestamp,
} from "./helpers.js";

const defaultPrompt =
  "Continue from prior context if available. Provide progress update and execute the next high-impact step.";

async function main(): Promise<void> {
  const prompt = argv.slice(2).join(" ").trim() || defaultPrompt;

  await ensureRuntimeDirs();

  const codex = createCodexClient();
  const threadOptions = defaultThreadOptions();
  const savedThreadId = await readSavedThreadId();
  const thread = savedThreadId
    ? codex.resumeThread(savedThreadId, threadOptions)
    : codex.startThread(threadOptions);

  console.log(`[${timestamp()}] Running persistent worker...`);
  console.log(savedThreadId ? `Mode: RESUME (${savedThreadId})` : "Mode: START_NEW");
  console.log(`Prompt: ${prompt}`);

  const turn = await thread.run(prompt);
  await saveThreadId(thread.id);

  console.log("\n=== PERSISTENT WORKER RESULT ===");
  console.log(`Active thread ID: ${thread.id ?? "unavailable"}`);
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
  console.error(`Persistent worker failed: ${message}`);
  process.exit(1);
});

