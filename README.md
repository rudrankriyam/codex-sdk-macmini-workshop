# Codex SDK Mac Mini Workshop

Build an always-on AI engineering co-worker with the Codex SDK, running on a Mac Mini headless server. Demo from your MacBook Pro via Tailscale.

## What is included

| Script | What it does |
|--------|-------------|
| `01-basic-worker.ts` | Minimal `startThread()` + `run()` demo |
| `02-structured-worker.ts` | JSON-schema constrained output |
| `03-persistent-worker.ts` | Save and resume `threadId` across runs |
| `04-daemon-worker.ts` | Always-on loop for Mac Mini service mode |
| `05-pr-reviewer.ts` | Streaming PR review — posts a comment via `gh` |
| `06-slack-coworker.ts` | Slack bot (Socket Mode) — @mention to run Codex |
| `summarize-file.ts` | Summarize any file with size-guarded prompt |
| `launchd/` | Template plist for `launchd` daemon setup |

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
# Uses default repo (Foundation-Models-Framework-Example)
npm run demo:pr-review -- 42

# Override repo
npm run demo:pr-review -- rudrankriyam/some-other-repo 7
```

### Slack coworker

A Socket Mode bot that responds to @mentions and DMs:

```bash
npm run worker:slack
```

See the [Slack App setup](#slack-app-setup) section below for configuration.

## Workshop preflight

```bash
npm run workshop:check          # quick env + typecheck
npm run workshop:check:demos    # also exercises all demo scripts
```

## Always-on daemon worker

```bash
npm run worker:daemon
```

Runtime files: `state/thread-id.txt`, `logs/worker.log`

## launchd setup (Mac Mini)

1. Open `launchd/com.rudrank.codex-worker.plist`
2. Replace all `__REPO_ROOT__` placeholders with your absolute project path
3. Copy and load:

```bash
cp launchd/com.rudrank.codex-worker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.rudrank.codex-worker.plist
launchctl list | rg codex-worker
```

4. Check logs: `tail -f logs/worker.log`
5. Unload: `launchctl unload ~/Library/LaunchAgents/com.rudrank.codex-worker.plist`

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

## Remote demo setup: Tailscale (Mac Mini + MacBook Pro)

This is the setup for running the Codex worker on your Mac Mini while presenting the demo from your MacBook Pro.

### Why Tailscale?

Tailscale creates a private WireGuard mesh VPN between your devices. No port forwarding, no public IPs, no firewall rules. Both machines get stable IPs on your tailnet (e.g. `100.x.y.z`) that work from anywhere — home, conference Wi-Fi, hotel, tethered phone.

### One-time setup

**On both machines (Mac Mini + MacBook Pro):**

```bash
# Install Tailscale
brew install tailscale

# Start the service
brew services start tailscale

# Authenticate (opens browser)
tailscale up
```

After both machines are authenticated, verify they can see each other:

```bash
tailscale status
```

You should see both machines listed with their Tailscale IPs.

**On the Mac Mini — enable SSH:**

1. System Settings > General > Sharing > Remote Login > toggle ON
2. Make sure your user is in the allowed list

**Test from your MacBook Pro:**

```bash
# Use the Tailscale IP or hostname (shown in `tailscale status`)
ssh rudrank@<mac-mini-tailscale-ip>

# Or use the MagicDNS hostname (usually the machine name)
ssh rudrank@mac-mini
```

### Workshop demo workflow

**Before the session — start services on Mac Mini:**

```bash
# SSH into Mac Mini from MacBook Pro
ssh rudrank@mac-mini

# Navigate to the workshop repo
cd ~/codex-sdk-macmini-workshop

# Start the daemon worker (runs in background via launchd or tmux)
tmux new -s codex-worker
npm run worker:daemon
# Ctrl+B, D to detach

# Start the Slack bot
tmux new -s slack-bot
npm run worker:slack
# Ctrl+B, D to detach
```

**During the live demo — from MacBook Pro:**

```bash
# Run quick demos against the Mac Mini workspace (over SSH)
ssh rudrank@mac-mini "cd ~/codex-sdk-macmini-workshop && npm run demo:basic"

# Review a PR on Foundation Models repo
ssh rudrank@mac-mini "cd ~/codex-sdk-macmini-workshop && npm run demo:pr-review -- 42"

# Summarize a file from the Foundation Models project
ssh rudrank@mac-mini "cd ~/codex-sdk-macmini-workshop && npm run demo:summarize -- ~/Developer/Apps/Foundation-Models-Framework-Example/README.md"

# Check daemon logs in real time
ssh rudrank@mac-mini "tail -f ~/codex-sdk-macmini-workshop/logs/worker.log"

# Reattach to tmux sessions if needed
ssh rudrank@mac-mini -t "tmux attach -t codex-worker"
```

**Slack demo — show it live:**

1. Open Slack on your MacBook Pro
2. @mention the Codex bot in a channel
3. Show the audience the message going out, the thinking indicator, and the reply coming back
4. The bot is running on the Mac Mini via Tailscale — completely headless

### Tips for reliable demos

- **Test the night before**: SSH in, run each demo once, check Slack bot responds
- **Use tmux**: Keeps processes alive if your SSH session drops
- **Tailscale is stable on conference Wi-Fi**: It uses DERP relays as fallback if direct connections fail — you'll still connect even on restrictive networks
- **Have recordings ready**: Record a terminal session of each demo as backup (`asciinema rec` or screen recording)
- **Keep prompts short**: Use pre-written prompts to minimize latency during live demos
- **MagicDNS**: Enable it in Tailscale admin console so you can use `ssh rudrank@mac-mini` instead of IP addresses

### Alternative: VS Code Remote SSH

If you prefer a GUI, VS Code Remote SSH works over Tailscale too:

1. Install the "Remote - SSH" extension in VS Code / Cursor
2. Connect to `rudrank@mac-mini` (Tailscale hostname)
3. Open the workshop folder — now you're editing and running terminals directly on the Mac Mini
4. Present your VS Code window to the audience

---

## Foundation Models Framework Example

The [Foundation-Models-Framework-Example](https://github.com/rudrankriyam/Foundation-Models-Framework-Example) project is the target workspace for Codex demos. It's an iOS/macOS app built with Apple's Foundation Models framework featuring:

- Chat, structured generation, tool calling, RAG, voice, health dashboard
- A CLI tool (`FoundationLabCLI`) with 12 subcommands
- Swift Playgrounds for hands-on learning

The PR reviewer and summarize scripts work great against this repo — it's large enough to produce meaningful reviews and small enough for fast Codex turnaround.

## Notes for workshop reliability

- Keep daemon defaults safe (`read-only` sandbox + `approval never`) unless you explicitly need edits
- Keep fallback recordings for each script demo
- Prefer short prompts during live sessions to avoid latency spikes
- Test Tailscale connection before going on stage
