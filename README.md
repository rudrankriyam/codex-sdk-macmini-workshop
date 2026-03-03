# Codex SDK Mac Mini Workshop Starter

Starter repository for building an always-on AI engineering co-worker with the Codex SDK.

## What is included

- `scripts/01-basic-worker.ts` - minimal `startThread()` + `run()` demo.
- `scripts/02-structured-worker.ts` - JSON-schema constrained output demo.
- `scripts/03-persistent-worker.ts` - save and resume `threadId`.
- `scripts/04-daemon-worker.ts` - always-on loop for Mac Mini service mode.
- `launchd/com.rudrank.codex-worker.plist` - template for `launchd` daemon setup.

## Prerequisites

- Node.js 18+ (Node 20+ recommended).
- Codex CLI auth set up (`codex login`) OR `CODEX_API_KEY` in env.
- A git repository as working directory (or set `SKIP_GIT_REPO_CHECK=true` for demos).

## Install

```bash
npm install
```

## Environment

Copy the sample file and adjust values:

```bash
cp .env.example .env
```

All scripts automatically load `.env` via `dotenv`.

Recommended workshop-safe defaults:

- `CODEX_SANDBOX_MODE=read-only`
- `CODEX_APPROVAL_POLICY=never`
- `CODEX_NETWORK_ACCESS_ENABLED=false`

## Run demos

```bash
npm run demo:basic
npm run demo:structured
npm run demo:persistent
```

You can override prompts inline:

```bash
npm run demo:basic -- "Analyze this repo and propose a 3-step reliability plan."
npm run demo:structured -- "Return status and top actions for engineering backlog triage."
npm run demo:persistent -- "Continue from the previous plan and execute step 1."
```

## Workshop preflight

Run this before a live session:

```bash
npm run workshop:check
```

For a full smoke pass that also exercises all demos:

```bash
npm run workshop:check:demos
```

## Run always-on daemon worker

```bash
npm run worker:daemon
```

Runtime files:

- state: `state/thread-id.txt`
- logs: `logs/worker.log`

## launchd setup (Mac Mini)

1. Open `launchd/com.rudrank.codex-worker.plist`.
2. Replace all `__REPO_ROOT__` placeholders with your absolute project path.
3. Copy plist into your launch agents directory:

```bash
cp launchd/com.rudrank.codex-worker.plist ~/Library/LaunchAgents/
```

4. Load service:

```bash
launchctl load ~/Library/LaunchAgents/com.rudrank.codex-worker.plist
launchctl list | rg codex-worker
```

5. Check logs:

```bash
tail -f logs/worker.log
tail -f logs/launchd.err.log
```

6. Unload service:

```bash
launchctl unload ~/Library/LaunchAgents/com.rudrank.codex-worker.plist
```

## Notes for workshop reliability

- Keep daemon defaults safe (`read-only` sandbox + `approval never`) unless you explicitly need edits.
- Keep fallback recordings for each script demo.
- Prefer short prompts during live sessions to avoid latency spikes.

