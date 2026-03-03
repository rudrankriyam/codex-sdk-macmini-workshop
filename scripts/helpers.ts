import "dotenv/config";

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Codex, type ThreadOptions } from "@openai/codex-sdk";

const REPO_ROOT = process.cwd();

export const paths = {
  stateDir: path.join(REPO_ROOT, "state"),
  logsDir: path.join(REPO_ROOT, "logs"),
  threadIdFile: path.join(REPO_ROOT, "state", "thread-id.txt"),
  workerLogFile: path.join(REPO_ROOT, "logs", "worker.log"),
} as const;

export function createCodexClient(): Codex {
  return new Codex({
    apiKey: process.env.CODEX_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL,
  });
}

export function defaultThreadOptions(overrides: Partial<ThreadOptions> = {}): ThreadOptions {
  return {
    workingDirectory: REPO_ROOT,
    skipGitRepoCheck: process.env.SKIP_GIT_REPO_CHECK === "true",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    ...overrides,
  };
}

export async function ensureRuntimeDirs(): Promise<void> {
  await mkdir(paths.stateDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
}

export async function readSavedThreadId(): Promise<string | null> {
  try {
    await access(paths.threadIdFile);
  } catch {
    return null;
  }

  const raw = (await readFile(paths.threadIdFile, "utf8")).trim();
  return raw.length > 0 ? raw : null;
}

export async function saveThreadId(threadId: string | null): Promise<void> {
  if (!threadId) {
    return;
  }

  await writeFile(paths.threadIdFile, `${threadId}\n`, "utf8");
}

export function timestamp(): string {
  return new Date().toISOString();
}

export function trimForLog(text: string, maxChars: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, maxChars)}...`;
}

export async function logLine(filePath: string, line: string): Promise<void> {
  await appendFile(filePath, `${line}\n`, "utf8");
}

export async function delayMs(ms: number): Promise<void> {
  await sleep(ms);
}

export function parseStructuredJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = blockMatch ? blockMatch[1].trim() : trimmed;
  return JSON.parse(candidate) as T;
}

