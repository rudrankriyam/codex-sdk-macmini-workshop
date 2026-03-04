import { argv } from "node:process";
import { readFile, stat } from "node:fs/promises";
import { createCodexClient, defaultThreadOptions, timestamp, trimForLog } from "./helpers.js";

const MAX_FILE_BYTES = 50_000;
const defaultPath = "README.md";

async function main(): Promise<void> {
  const filePath = argv.slice(2).join(" ").trim() || defaultPath;

  let content: string;
  try {
    const info = await stat(filePath);
    if (info.size > MAX_FILE_BYTES) {
      console.log(
        `File is ${(info.size / 1024).toFixed(0)} KB — truncating to first ${(MAX_FILE_BYTES / 1024).toFixed(0)} KB to fit prompt budget.`,
      );
    }
    const raw = await readFile(filePath, "utf8");
    content = raw.slice(0, MAX_FILE_BYTES);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Cannot read "${filePath}": ${message}`);
    process.exit(1);
    return;
  }

  const codex = createCodexClient();
  const thread = codex.startThread(defaultThreadOptions());

  const prompt = `Summarize this file in one paragraph:\n\n${content}`;

  console.log(`[${timestamp()}] Summarizing ${filePath} (${content.length} chars)...`);
  const turn = await thread.run(prompt);

  console.log(`\n${turn.finalResponse}`);
  if (turn.usage) {
    console.log(
      `\nUsage: input=${turn.usage.input_tokens}, cached=${turn.usage.cached_input_tokens}, output=${turn.usage.output_tokens}`,
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Summarize failed: ${message}`);
  process.exit(1);
});
