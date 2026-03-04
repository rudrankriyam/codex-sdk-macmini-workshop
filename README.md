# Codex SDK Workshop

Build an always-on AI engineering co-worker with the Codex SDK. Runs on a Mac Mini, a Linux VPS, or any machine with Node.js. Demo from your laptop via SSH + Tailscale.

## What is included

| Script | What it does |
|--------|-------------|
| `01-basic-worker.ts` | Minimal `startThread()` + `run()` demo |
| `02-structured-worker.ts` | JSON-schema constrained output |
| `03-persistent-worker.ts` | Save and resume `threadId` across runs |
| `07-web-access-worker.ts` | Live web-search-enabled run with streamed events |
| `04-daemon-worker.ts` | Always-on loop for headless service mode |
| `05-pr-reviewer.ts` | Streaming PR review — posts a comment via `gh` |
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
npm run demo:web-access
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

### Web access demo

Runs with thread-level overrides (`networkAccessEnabled=true`, `webSearchMode=live`) and prints streamed `web_search` items so you can show live web capability during the workshop:

```bash
npm run demo:web-access
npm run demo:web-access -- "Find the latest Xcode release notes and summarize the top 3 changes with source links."
```

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
```

Reattach later: `tmux attach -t codex-worker`

---

## Remote demo setup

You're presenting from your MacBook Pro (screen-shared over a video call). The Codex worker runs on a separate machine — a Mac Mini on your desk, a Linux VPS, or both. The audience sees your MacBook Pro screen.

### Your options

| Setup | How it works | Best for |
|-------|-------------|----------|
| **Same-network SSH** | Both machines on your home Wi-Fi — just SSH by local IP | Simplest, zero extra tools |
| **Tailscale** | Private WireGuard VPN — stable IPs even across networks | Mac Mini behind NAT, or if you also want to reach a VPS |
| **Direct SSH to VPS** | Public IP, standard SSH | Cloud server with a public IP |
| **Cursor Remote SSH** | Full IDE on the remote machine, presented locally | Best visual experience for code + terminal demos |
| **Apple Screen Sharing** | Stream the full Mac Mini desktop (Xcode, Simulator, etc.) | Showing GUI apps like Xcode building or Simulator running |

### Option 1: Same-network SSH (Mac Mini on your desk)

Your MacBook Pro and Mac Mini are both on your home Wi-Fi. Find the Mac Mini's local IP and SSH in.

**On the Mac Mini — one-time setup:**

1. System Settings > General > Sharing > Remote Login > ON
2. Note the IP address (System Settings > Wi-Fi > Details > IP Address), e.g. `192.168.1.50`

**From your MacBook Pro:**

```bash
ssh rudrank@192.168.1.50
```

To avoid typing the IP every time, add it to `~/.ssh/config` on your MacBook Pro:

```
Host mac-mini
  HostName 192.168.1.50
  User rudrank
```

Now you can just `ssh mac-mini`.

### Option 2: Tailscale (any network topology)

Tailscale creates a private WireGuard mesh VPN. Both machines get stable `100.x.y.z` IPs that work regardless of network — useful if you ever demo from a different location, or want to reach both a local Mac Mini and a remote VPS.

**Install on both machines:**

```bash
# macOS
brew install tailscale
brew services start tailscale
tailscale up

# Linux VPS
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
sudo tailscale up
```

**Verify:**

```bash
tailscale status    # both machines listed with IPs
```

**Enable MagicDNS** in the [Tailscale admin console](https://login.tailscale.com/admin/dns) so you can use hostnames like `mac-mini` instead of IPs.

**SSH in:**

```bash
ssh rudrank@mac-mini        # Tailscale MagicDNS
ssh rudrank@100.64.0.2      # or use the Tailscale IP
```

### Option 3: Cursor Remote SSH (recommended for live demos)

This gives you a full Cursor IDE running on the remote machine, displayed on your MacBook Pro. The audience sees a normal editor — they don't need to know it's remote. Terminals, file explorer, extensions, and AI features all work as if the project were local.

**One-time setup:**

1. Open Cursor on your MacBook Pro
2. Install the **Remote - SSH** extension (if not already installed):
   - `Cmd+Shift+X` > search "Remote - SSH" > Install
3. Add the remote host to your SSH config (`~/.ssh/config` on your MacBook Pro):

```
Host mac-mini
  HostName 192.168.1.50
  User rudrank

Host my-vps
  HostName 203.0.113.42
  User deploy
```

(Use Tailscale hostnames/IPs if you went with Option 2.)

4. Set up SSH key auth so you don't need to type a password during the demo:

```bash
# Generate a key if you don't have one
ssh-keygen -t ed25519

# Copy it to the remote machine
ssh-copy-id mac-mini
ssh-copy-id my-vps    # if using a VPS too
```

**Connecting during the workshop:**

1. `Cmd+Shift+P` > **Remote-SSH: Connect to Host...** > pick `mac-mini` (or `my-vps`)
2. Cursor opens a new window connected to the remote machine
3. **File > Open Folder** > `~/codex-sdk-workshop`
4. Open the integrated terminal (`Ctrl+Backtick`) — this terminal runs on the remote machine
5. Run demos directly:

```bash
npm run demo:basic
npm run demo:pr-review -- 42
npm run demo:summarize -- README.md
```

Everything the audience sees — file tree, editor, terminal output — is your MacBook Pro screen, but the code and processes run on the Mac Mini / VPS.

**Pro tip:** Open a split terminal. Run the demo command in one pane and `tail -f logs/worker.log` in the other. The audience sees both side by side.

### Option 4: Apple Screen Sharing (show Xcode + Simulator)

When you need the audience to see the Mac Mini's full desktop — Xcode building, Simulator launching, the Foundation Lab app running — use the built-in Screen Sharing.

**On the Mac Mini — one-time setup:**

1. System Settings > General > Sharing > **Screen Sharing** > ON
2. Make sure your user account is in the allowed list

**From your MacBook Pro:**

```bash
# Connect via Finder
# Go > Connect to Server > vnc://192.168.1.50

# Or open Screen Sharing.app directly
open /System/Library/CoreServices/Applications/Screen\ Sharing.app
```

You can also use the Tailscale IP (`vnc://100.x.y.z`) or MagicDNS hostname (`vnc://mac-mini`).

**Display tips for the workshop:**

- **View > Fit to Window** — scales the Mac Mini desktop to fit your MacBook Pro window
- **View > Show Toolbar** — gives you clipboard sharing between machines
- Resize the Screen Sharing window to roughly match your screen-share resolution so the audience gets a crisp image

**When to show Screen Sharing vs Cursor:**

| Showing | Use |
|---------|-----|
| Running Codex scripts, editing code, reading terminal output | Cursor Remote SSH |
| Xcode building the Foundation Lab project | Screen Sharing |
| iOS Simulator launching and running the app | Screen Sharing |
| XcodeBuildMCP triggering builds/tests | Screen Sharing |
| PR review comment appearing on GitHub | Browser on your MacBook Pro |

During the workshop, you switch windows on your MacBook Pro — Cursor for code, Screen Sharing for Xcode/Simulator, browser for GitHub.

### Demo workflow for a remote workshop

You're on a video call (Zoom, Meet, etc.), screen-sharing your MacBook Pro.

**30 minutes before the call:**

```bash
# SSH into your server (Mac Mini or VPS)
ssh mac-mini
cd ~/codex-sdk-workshop

# Start long-running services in tmux
tmux new -s codex-worker -d "npm run worker:daemon"

# Verify they're running
tmux ls
```

**During the call — what the audience sees:**

1. **Terminal demos** — Open Cursor Remote SSH to the Mac Mini (or a regular terminal SSH session). Run scripts live. The audience sees your terminal output in real time.

2. **Xcode + Simulator demos** — Switch to the Screen Sharing window. The audience sees the Mac Mini's desktop — Xcode building, Simulator launching, the Foundation Lab app running. Trigger builds via XcodeBuildMCP or the Xcode GUI on the Mac Mini.

3. **PR review demo** — Open a GitHub PR in your browser. Run `npm run demo:pr-review -- 42` in the remote terminal. Switch to the browser and refresh — the review comment appears.

4. **Daemon worker** — Show `tail -f logs/worker.log` in a terminal. Explain that this runs 24/7 on the Mac Mini, doing periodic check-ins. Scroll through past entries.

**If something breaks during the demo:**

- Have pre-recorded terminal sessions ready (`asciinema` or screen recordings)
- Have screenshot/paste of expected output for each demo

### Tips for reliable remote workshops

- **Wired ethernet on the Mac Mini** if possible — more stable than Wi-Fi for the server
- **Test the full flow the night before**: SSH in, run each demo, verify `gh` auth
- **Pre-written prompts**: Copy-paste from a notes file instead of typing live
- **Keep your MacBook Pro plugged in**: Long workshops drain battery fast with screen sharing
- **Close unnecessary apps**: Screen sharing + Cursor + browser is already a lot
- **Have a backup plan**: If SSH dies, switch to pre-recorded demos and narrate over them

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
