import type { ApprovalMode, SandboxMode } from "@openai/codex-sdk";

import {
  createCodexClient,
  defaultThreadOptions,
  delayMs,
  ensureRuntimeDirs,
  logLine,
  paths,
  readSavedThreadId,
  saveThreadId,
  timestamp,
  trimForLog,
} from "./helpers.js";

const DEFAULT_PROMPT =
  "Provide a concise engineering check-in for this project with top 3 actionable next steps.";

function asPositiveInt(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveSandboxMode(): SandboxMode {
  const raw = process.env.WORKER_SANDBOX_MODE;
  if (raw === "read-only" || raw === "workspace-write" || raw === "danger-full-access") {
    return raw;
  }
  return "read-only";
}

function resolveApprovalPolicy(): ApprovalMode {
  const raw = process.env.WORKER_APPROVAL_POLICY;
  if (raw === "never" || raw === "on-request" || raw === "on-failure" || raw === "untrusted") {
    return raw;
  }
  return "never";
}

async function runCycle(prompt: string): Promise<void> {
  const codex = createCodexClient();
  const savedThreadId = await readSavedThreadId();

  const threadOptions = defaultThreadOptions({
    sandboxMode: resolveSandboxMode(),
    approvalPolicy: resolveApprovalPolicy(),
  });

  const thread = savedThreadId
    ? codex.resumeThread(savedThreadId, threadOptions)
    : codex.startThread(threadOptions);

  const turn = await thread.run(prompt);
  await saveThreadId(thread.id);

  const maxChars = asPositiveInt(process.env.WORKER_MAX_RESPONSE_CHARS, 1000);
  const shortResponse = trimForLog(turn.finalResponse, maxChars);
  const usageText = turn.usage
    ? `input=${turn.usage.input_tokens}, cached=${turn.usage.cached_input_tokens}, output=${turn.usage.output_tokens}`
    : "usage=unavailable";

  await logLine(
    paths.workerLogFile,
    `[${timestamp()}] OK thread=${thread.id ?? "unknown"} ${usageText} response="${shortResponse}"`,
  );
}

async function main(): Promise<void> {
  await ensureRuntimeDirs();

  const intervalMinutes = asPositiveInt(process.env.WORKER_INTERVAL_MINUTES, 30);
  const intervalMs = intervalMinutes * 60_000;
  const prompt = process.env.WORKER_PROMPT?.trim() || DEFAULT_PROMPT;

  let shouldStop = false;
  const stopHandler = () => {
    shouldStop = true;
  };
  process.on("SIGINT", stopHandler);
  process.on("SIGTERM", stopHandler);

  await logLine(
    paths.workerLogFile,
    `[${timestamp()}] START interval=${intervalMinutes}m sandbox=${resolveSandboxMode()} approval=${resolveApprovalPolicy()}`,
  );

  while (!shouldStop) {
    const enabled = (process.env.WORKER_ENABLED ?? "true") !== "false";
    if (!enabled) {
      await logLine(paths.workerLogFile, `[${timestamp()}] SKIP worker disabled via WORKER_ENABLED=false`);
      await delayMs(intervalMs);
      continue;
    }

    try {
      await runCycle(prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logLine(paths.workerLogFile, `[${timestamp()}] ERROR ${message}`);
    }

    await delayMs(intervalMs);
  }

  await logLine(paths.workerLogFile, `[${timestamp()}] STOP signal received`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Daemon worker failed: ${message}`);
  process.exit(1);
});

