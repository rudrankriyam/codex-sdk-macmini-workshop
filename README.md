# Codex SDK Workshop

Build an always-on AI engineering co-worker with the Codex SDK. Runs on a Mac Mini, a Linux VPS, or any machine with Node.js. Demo from your laptop via SSH + Tailscale.

## What is included

| Script | What it does |
|--------|-------------|
| `01-basic-worker.ts` | Minimal `startThread()` + `run()` demo |
| `02-structured-worker.ts` | JSON-schema constrained output |
| `03-persistent-worker.ts` | Save and resume `threadId` across runs |
| `04-daemon-worker.ts` | Always-on loop for headless service mode |
| `05-pr-reviewer.ts` | Streaming PR review — posts a comment via `gh` |
| `06-slack-coworker.ts` | Slack bot (Socket Mode) — @mention to run Codex |
| `summarize-file.ts` | Summarize any file with size-guarded prompt |
| `launchd/` | macOS `launchd` plist template |
| `systemd/` | Linux `systemd` unit file template |

All scripts target the [Foundation Models Framework Example](https://github.com/rudrankriyam/Foundation-Models-Framework-Example) repo as the default workspace for demos.

## Prerequisites

- Node.js 18+ (Node 20+ recommended)
- Codex CLI auth set up (`codex login`) or `CODEX_API_KEY` in env
- A git repository as working directory (or set `SKIP_GIT_REPO_CHECK=true` for demos)
- `gh` CLI authenticated (for PR reviewer)

## Install

```bash
npm install
```

## Environment

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
npm run demo:summarize -- README.md
```

Override prompts inline:

```bash
npm run demo:basic -- "Analyze this repo and propose a 3-step reliability plan."
npm run demo:structured -- "Return status and top actions for engineering backlog triage."
npm run demo:persistent -- "Continue from the previous plan and execute step 1."
```

### PR reviewer

Reviews a pull request and posts a comment via `gh`:

```bash
npm run demo:pr-review -- 42                                  # default repo
npm run demo:pr-review -- rudrankriyam/some-other-repo 7      # override repo
```

### Slack coworker

A Socket Mode bot that responds to @mentions and DMs:

```bash
npm run worker:slack
```

See [Slack App setup](#slack-app-setup) below for configuration.

## Workshop preflight

```bash
npm run workshop:check          # env + typecheck + optional tool checks
npm run workshop:check:demos    # also exercises all demo scripts
```

## Always-on daemon worker

```bash
npm run worker:daemon
```

Runtime files: `state/thread-id.txt`, `logs/worker.log`

---

## Deploying as a service

Pick whichever matches your server.

### Option A: macOS (Mac Mini) — launchd

1. Edit `launchd/com.rudrank.codex-worker.plist` — replace every `__REPO_ROOT__` with your absolute project path
2. Copy and load:

```bash
cp launchd/com.rudrank.codex-worker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.rudrank.codex-worker.plist
launchctl list | grep codex-worker
```

3. Check logs: `tail -f logs/launchd.out.log`
4. Unload: `launchctl unload ~/Library/LaunchAgents/com.rudrank.codex-worker.plist`

### Option B: Linux VPS — systemd

1. Edit `systemd/codex-worker.service` — replace `__REPO_ROOT__` and `__USER__`:

```bash
sed -i "s|__REPO_ROOT__|$(pwd)|g; s|__USER__|$(whoami)|g" systemd/codex-worker.service
```

2. Install and start:

```bash
sudo cp systemd/codex-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now codex-worker
```

3. Check status and logs:

```bash
sudo systemctl status codex-worker
journalctl -u codex-worker -f
tail -f logs/systemd.out.log
```

4. Stop: `sudo systemctl stop codex-worker`

### Option C: Any machine — tmux (simplest)

Works on macOS, Linux, or any server you can SSH into:

```bash
tmux new -s codex-worker
npm run worker:daemon
# Ctrl+B, D to detach

tmux new -s slack-bot
npm run worker:slack
# Ctrl+B, D to detach
```

Reattach later: `tmux attach -t codex-worker`

---

## Slack App setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app **From scratch**
2. Under **Socket Mode**, enable it and generate an **App-Level Token** with `connections:write` scope — this is your `SLACK_APP_TOKEN` (starts with `xapp-`)
3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
4. Install the app to your workspace — copy the **Bot User OAuth Token** as `SLACK_BOT_TOKEN` (starts with `xoxb-`)
5. Under **Event Subscriptions**, enable events and subscribe to:
   - `app_mention`
   - `message.im`
6. Add both tokens to your `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
```

7. Run: `npm run worker:slack`
8. @mention the bot in any channel it's been invited to, or DM it directly

---

## Remote demo: SSH + Tailscale

Run the Codex worker on your server (Mac Mini, VPS, or anything) while presenting from your laptop.

### Why Tailscale?

Tailscale creates a private WireGuard mesh VPN. No port forwarding, no public IPs, no firewall rules. Both machines get stable IPs on your tailnet (e.g. `100.x.y.z`) that work from anywhere — home, conference Wi-Fi, hotel, tethered phone.

> **Already have a VPS with a public IP?** You can skip Tailscale entirely and SSH directly. Tailscale is most useful when your server is behind NAT (like a Mac Mini at home) or you want zero-config private networking.

### Install Tailscale

**macOS (Mac Mini or laptop):**

```bash
brew install tailscale
brew services start tailscale
tailscale up
```

**Linux VPS (Ubuntu/Debian):**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
sudo tailscale up
```

**Verify connectivity:**

```bash
tailscale status    # both machines should appear
```

### Enable SSH on the server

**macOS:** System Settings > General > Sharing > Remote Login > ON

**Linux:** SSH is typically already running. If not: `sudo systemctl enable --now ssh`

### Test the connection

```bash
# Tailscale MagicDNS hostname (or use the 100.x.y.z IP)
ssh you@your-server

# If using a VPS with public IP, just use that directly
ssh you@203.0.113.42
```

### Demo workflow

**Before the session — start services on the server:**

```bash
ssh you@your-server
cd ~/codex-sdk-workshop

# Option 1: tmux (works everywhere)
tmux new -s codex-worker
npm run worker:daemon
# Ctrl+B, D to detach

tmux new -s slack-bot
npm run worker:slack
# Ctrl+B, D to detach

# Option 2: systemd (Linux) or launchd (macOS) — see service sections above
```

**During the live demo — from your laptop:**

```bash
# Run demos remotely
ssh you@your-server "cd ~/codex-sdk-workshop && npm run demo:basic"
ssh you@your-server "cd ~/codex-sdk-workshop && npm run demo:pr-review -- 42"
ssh you@your-server "cd ~/codex-sdk-workshop && npm run demo:summarize -- README.md"

# Watch daemon logs live
ssh you@your-server "tail -f ~/codex-sdk-workshop/logs/worker.log"

# Reattach to a tmux session
ssh you@your-server -t "tmux attach -t codex-worker"
```

**Slack demo — show it live from the audience's perspective:**

1. Open Slack on your laptop
2. @mention the Codex bot in a channel
3. Show the message going out, the thinking indicator, and the reply
4. The bot is running headlessly on your server

### Alternative: VS Code / Cursor Remote SSH

1. Install the "Remote - SSH" extension
2. Connect to `you@your-server` (Tailscale hostname or public IP)
3. Open the workshop folder — full IDE experience on the remote machine
4. Present your editor window to the audience

### Tips for reliable demos

- **Test the night before**: SSH in, run each demo once, check Slack bot responds
- **tmux keeps processes alive**: Even if your SSH session drops
- **Tailscale on conference Wi-Fi**: Uses DERP relays as fallback if direct connections fail
- **Have recordings ready**: `asciinema rec` or screen recording as backup
- **Short prompts**: Pre-written prompts minimize latency during live demos
- **MagicDNS**: Enable it in Tailscale admin so you can `ssh you@mac-mini` instead of IPs

---

## Foundation Models Framework Example

The [Foundation-Models-Framework-Example](https://github.com/rudrankriyam/Foundation-Models-Framework-Example) project is the default target workspace for Codex demos. It's an iOS/macOS app built with Apple's Foundation Models framework featuring:

- Chat, structured generation, tool calling, RAG, voice, health dashboard
- A CLI tool (`FoundationLabCLI`) with 12 subcommands
- Swift Playgrounds for hands-on learning

The PR reviewer and summarize scripts work great against this repo — large enough for meaningful reviews, small enough for fast Codex turnaround.

## Notes for workshop reliability

- Keep daemon defaults safe (`read-only` sandbox + `approval never`) unless you explicitly need edits
- Keep fallback recordings for each script demo
- Prefer short prompts during live sessions to avoid latency spikes
- Test your SSH / Tailscale connection before going on stage
- The Codex SDK is pure Node.js — no macOS-specific dependencies
