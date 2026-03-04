import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { delayMs, ensureRuntimeDirs, logLine, paths, timestamp } from "./helpers.js";

const execFileAsync = promisify(execFile);

const DEFAULT_REPO = "rudrankriyam/Foundation-Models-Framework-Example";
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_MAX_REVIEWS_PER_CYCLE = 2;
const DEFAULT_TRIGGER_PHRASE = "@codex-review";
const DEFAULT_MODE: PollMode = "auto";
const DEFAULT_INCLUDE_DRAFTS = false;

const POLLER_STATE_FILE = `${paths.stateDir}/pr-review-poller-state.json`;
const POLLER_LOG_FILE = `${paths.logsDir}/pr-review-poller.log`;

type PollMode = "auto" | "trigger";

type PullRequestSummary = {
  number: number;
  title: string;
  updatedAt: string;
  isDraft: boolean;
};

type IssueComment = {
  id: number;
  body: string;
  created_at: string;
  user?: {
    login?: string;
  };
};

type ReviewRecord = {
  reviewedAt: string;
  sourceUpdatedAt: string;
  triggerCommentAt: string | null;
};

type PollerState = {
  reviews: Record<string, ReviewRecord>;
};

type PollerConfig = {
  enabled: boolean;
  repo: string;
  intervalSeconds: number;
  maxReviewsPerCycle: number;
  mode: PollMode;
  triggerPhrase: string;
  includeDrafts: boolean;
  runOnce: boolean;
};

type ReviewDecision = {
  shouldReview: boolean;
  reason: string;
  triggerCommentAt: string | null;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true";
}

function resolveMode(value: string | undefined): PollMode {
  return value === "trigger" ? "trigger" : DEFAULT_MODE;
}

function loadConfig(): PollerConfig {
  return {
    enabled: parseBoolean(process.env.PR_POLL_ENABLED, true),
    repo: process.env.PR_POLL_REPO?.trim() || process.env.PR_REVIEW_REPO?.trim() || DEFAULT_REPO,
    intervalSeconds: parsePositiveInt(process.env.PR_POLL_INTERVAL_SECONDS, DEFAULT_INTERVAL_SECONDS),
    maxReviewsPerCycle: parsePositiveInt(
      process.env.PR_POLL_MAX_REVIEWS_PER_CYCLE,
      DEFAULT_MAX_REVIEWS_PER_CYCLE,
    ),
    mode: resolveMode(process.env.PR_POLL_MODE),
    triggerPhrase: (process.env.PR_POLL_TRIGGER_PHRASE ?? DEFAULT_TRIGGER_PHRASE).trim(),
    includeDrafts: parseBoolean(process.env.PR_POLL_INCLUDE_DRAFTS, DEFAULT_INCLUDE_DRAFTS),
    runOnce: parseBoolean(process.env.PR_POLL_RUN_ONCE, false),
  };
}

async function loadState(): Promise<PollerState> {
  try {
    const raw = await readFile(POLLER_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as PollerState;
    if (!parsed || typeof parsed !== "object" || !parsed.reviews || typeof parsed.reviews !== "object") {
      return { reviews: {} };
    }
    return parsed;
  } catch {
    return { reviews: {} };
  }
}

async function saveState(state: PollerState): Promise<void> {
  await writeFile(POLLER_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function runGhJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("gh", args, {
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout) as T;
}

async function listOpenPrs(repo: string, includeDrafts: boolean): Promise<PullRequestSummary[]> {
  const prs = await runGhJson<PullRequestSummary[]>([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--limit",
    "100",
    "--json",
    "number,title,updatedAt,isDraft",
  ]);

  return includeDrafts ? prs : prs.filter((pr) => !pr.isDraft);
}

async function findLatestTriggerComment(
  repo: string,
  prNumber: number,
  triggerPhrase: string,
): Promise<IssueComment | null> {
  const comments = await runGhJson<IssueComment[]>([
    "api",
    `repos/${repo}/issues/${prNumber}/comments?per_page=100`,
  ]);

  const phrase = triggerPhrase.toLowerCase();
  let latest: IssueComment | null = null;

  for (const comment of comments) {
    const body = (comment.body ?? "").toLowerCase();
    if (!body.includes(phrase)) {
      continue;
    }

    if (!latest || new Date(comment.created_at).getTime() > new Date(latest.created_at).getTime()) {
      latest = comment;
    }
  }

  return latest;
}

function isLater(lhs: string, rhs: string): boolean {
  return new Date(lhs).getTime() > new Date(rhs).getTime();
}

async function decideReview(
  config: PollerConfig,
  state: PollerState,
  pr: PullRequestSummary,
): Promise<ReviewDecision> {
  const key = String(pr.number);
  const previous = state.reviews[key];

  if (config.mode === "auto") {
    if (!previous) {
      return { shouldReview: true, reason: "new PR", triggerCommentAt: null };
    }
    if (isLater(pr.updatedAt, previous.sourceUpdatedAt)) {
      return { shouldReview: true, reason: "PR updated since last review", triggerCommentAt: null };
    }
    return { shouldReview: false, reason: "no changes since last review", triggerCommentAt: null };
  }

  const latestTrigger = await findLatestTriggerComment(config.repo, pr.number, config.triggerPhrase);
  if (!latestTrigger) {
    return { shouldReview: false, reason: "no trigger comment found", triggerCommentAt: null };
  }

  if (!previous) {
    return {
      shouldReview: true,
      reason: `new trigger comment by @${latestTrigger.user?.login ?? "unknown"}`,
      triggerCommentAt: latestTrigger.created_at,
    };
  }

  const previousTrigger = previous.triggerCommentAt;
  if (!previousTrigger || isLater(latestTrigger.created_at, previousTrigger)) {
    return {
      shouldReview: true,
      reason: `new trigger comment by @${latestTrigger.user?.login ?? "unknown"}`,
      triggerCommentAt: latestTrigger.created_at,
    };
  }

  return { shouldReview: false, reason: "no new trigger comment", triggerCommentAt: latestTrigger.created_at };
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runPrReview(repo: string, prNumber: number): Promise<void> {
  await execFileAsync(
    npmCommand(),
    ["run", "demo:pr-review", "--", repo, String(prNumber)],
    {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

async function runCycle(config: PollerConfig, state: PollerState): Promise<void> {
  const prs = await listOpenPrs(config.repo, config.includeDrafts);
  const sorted = [...prs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  let reviewedCount = 0;
  let consideredCount = 0;

  for (const pr of sorted) {
    if (reviewedCount >= config.maxReviewsPerCycle) {
      break;
    }

    consideredCount += 1;
    const decision = await decideReview(config, state, pr);

    if (!decision.shouldReview) {
      await logLine(
        POLLER_LOG_FILE,
        `[${timestamp()}] SKIP pr=${pr.number} title="${pr.title}" reason="${decision.reason}"`,
      );
      continue;
    }

    await logLine(
      POLLER_LOG_FILE,
      `[${timestamp()}] REVIEW_START pr=${pr.number} title="${pr.title}" reason="${decision.reason}"`,
    );

    try {
      await runPrReview(config.repo, pr.number);

      state.reviews[String(pr.number)] = {
        reviewedAt: timestamp(),
        sourceUpdatedAt: pr.updatedAt,
        triggerCommentAt: decision.triggerCommentAt,
      };

      reviewedCount += 1;
      await logLine(
        POLLER_LOG_FILE,
        `[${timestamp()}] REVIEW_OK pr=${pr.number} updatedAt=${pr.updatedAt} reviewed=${reviewedCount}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logLine(
        POLLER_LOG_FILE,
        `[${timestamp()}] REVIEW_ERROR pr=${pr.number} message="${message.replace(/\s+/g, " ").trim()}"`,
      );
    }
  }

  await logLine(
    POLLER_LOG_FILE,
    `[${timestamp()}] CYCLE_SUMMARY open=${sorted.length} considered=${consideredCount} reviewed=${reviewedCount}`,
  );
}

async function main(): Promise<void> {
  await ensureRuntimeDirs();

  const config = loadConfig();
  const state = await loadState();

  let shouldStop = false;
  const stopHandler = () => {
    shouldStop = true;
  };
  process.on("SIGINT", stopHandler);
  process.on("SIGTERM", stopHandler);

  await logLine(
    POLLER_LOG_FILE,
    `[${timestamp()}] START repo=${config.repo} mode=${config.mode} interval=${config.intervalSeconds}s trigger="${config.triggerPhrase}" includeDrafts=${config.includeDrafts} runOnce=${config.runOnce}`,
  );
  console.log(`[${timestamp()}] PR poller started for ${config.repo}`);
  console.log(`Mode=${config.mode}, interval=${config.intervalSeconds}s, max/cycle=${config.maxReviewsPerCycle}`);
  console.log(`Logs: ${POLLER_LOG_FILE}`);

  while (!shouldStop) {
    if (!config.enabled) {
      await logLine(POLLER_LOG_FILE, `[${timestamp()}] SKIP poller disabled via PR_POLL_ENABLED=false`);
      await delayMs(config.intervalSeconds * 1000);
      continue;
    }

    try {
      await runCycle(config, state);
      await saveState(state);
      if (config.runOnce) {
        await logLine(POLLER_LOG_FILE, `[${timestamp()}] STOP runOnce=true completed one cycle`);
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logLine(POLLER_LOG_FILE, `[${timestamp()}] ERROR ${message.replace(/\s+/g, " ").trim()}`);
    }

    await delayMs(config.intervalSeconds * 1000);
  }

  await saveState(state);
  await logLine(POLLER_LOG_FILE, `[${timestamp()}] STOP signal received`);
  console.log(`[${timestamp()}] PR poller stopped`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR poller failed: ${message}`);
  process.exit(1);
});
