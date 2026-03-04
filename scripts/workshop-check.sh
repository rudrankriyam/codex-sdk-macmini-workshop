#!/usr/bin/env bash
set -euo pipefail

WITH_DEMOS=false
if [[ "${1:-}" == "--with-demos" ]]; then
  WITH_DEMOS=true
fi

log() {
  printf '%s\n' "$1"
}

warn() {
  printf 'WARNING: %s\n' "$1" >&2
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
}

optional_cmd() {
  local cmd="$1"
  local reason="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    log "$cmd: $(command -v "$cmd")"
  else
    warn "$cmd not found — $reason"
  fi
}

log "== Codex Workshop Preflight =="

case "$(uname -s)" in
  Darwin) log "platform: macOS ($(uname -m))" ;;
  Linux)  log "platform: Linux ($(uname -m))" ;;
  *)      log "platform: $(uname -s) ($(uname -m))" ;;
esac

require_cmd node
require_cmd npm
require_cmd codex

log "node: $(node --version)"
log "npm:  $(npm --version)"
log "codex: $(codex --version)"

if ! codex login status >/dev/null 2>&1; then
  fail "Codex is not authenticated. Run: codex login"
fi
log "codex auth: OK"

optional_cmd gh "needed for demo:pr-review"
optional_cmd tmux "recommended for running long-lived workers over SSH"
optional_cmd tailscale "needed for remote demo workflow"

mkdir -p logs state

if [[ ! -f ".env" ]]; then
  warn ".env not found (scripts can still run if your shell has required env variables)"
fi

log "running typecheck..."
npm run typecheck

if [[ "$WITH_DEMOS" == "true" ]]; then
  log "running smoke demos..."
  npm run demo:basic -- "Quick workshop smoke check: summarize repository purpose in 2 bullets." | tee "logs/workshop-check-basic.log"
  npm run demo:structured -- "Return structured JSON with summary, status, and actions for workshop readiness." | tee "logs/workshop-check-structured.log"
  npm run demo:persistent -- "Create a short prep plan for this workshop repository." | tee "logs/workshop-check-persistent-1.log"
  npm run demo:persistent -- "Resume previous context and provide the next concrete action." | tee "logs/workshop-check-persistent-2.log"
  if npm run demo:web-access -- "Use live web access to find the latest stable Node.js LTS and provide 2 bullets with links." | tee "logs/workshop-check-web-access.log"; then
    log "web access demo: PASS"
  else
    warn "web access demo failed (network may be blocked). Continuing."
  fi
fi

log "preflight: PASS"
