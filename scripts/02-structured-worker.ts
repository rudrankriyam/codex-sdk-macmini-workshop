import { argv } from "node:process";

import {
  createCodexClient,
  defaultThreadOptions,
  parseStructuredJson,
  timestamp,
} from "./helpers.js";

type StructuredWorkerResponse = {
  summary: string;
  status: "ok" | "action_required";
  actions: string[];
};

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    status: { type: "string", enum: ["ok", "action_required"] },
    actions: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
  },
  required: ["summary", "status", "actions"],
  additionalProperties: false,
} as const;

const defaultPrompt =
  "Summarize repository health and return concrete next engineering steps in structured JSON.";

async function main(): Promise<void> {
  const prompt = argv.slice(2).join(" ").trim() || defaultPrompt;

  const codex = createCodexClient();
  const thread = codex.startThread(defaultThreadOptions());

  console.log(`[${timestamp()}] Running structured worker...`);
  console.log(`Prompt: ${prompt}`);

  const turn = await thread.run(prompt, { outputSchema: responseSchema });

  let parsed: StructuredWorkerResponse;
  try {
    parsed = parseStructuredJson<StructuredWorkerResponse>(turn.finalResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse structured JSON output: ${message}`);
    console.error("Raw response:");
    console.error(turn.finalResponse);
    process.exit(1);
    return;
  }

  console.log("\n=== STRUCTURED WORKER RESULT ===");
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`Status: ${parsed.status}`);
  console.log(`Summary: ${parsed.summary}`);
  console.log("Actions:");
  parsed.actions.forEach((action, index) => {
    console.log(`${index + 1}. ${action}`);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Structured worker failed: ${message}`);
  process.exit(1);
});

