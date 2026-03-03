#!/usr/bin/env bash
set -euo pipefail

WITH_DEMOS=false
if [[ "${1:-}" == "--with-demos" ]]; then
  WITH_DEMOS=true
fi

log() {
  printf '%s\n' "$1"
}

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "Missing required command: $cmd"
}

log "== Codex Workshop Preflight =="

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

mkdir -p logs state

if [[ ! -f ".env" ]]; then
  log "warning: .env not found (scripts can still run if your shell has required env variables)"
fi

log "running typecheck..."
npm run typecheck

if [[ "$WITH_DEMOS" == "true" ]]; then
  log "running smoke demos..."
  npm run demo:basic -- "Quick workshop smoke check: summarize repository purpose in 2 bullets." | tee "logs/workshop-check-basic.log"
  npm run demo:structured -- "Return structured JSON with summary, status, and actions for workshop readiness." | tee "logs/workshop-check-structured.log"
  npm run demo:persistent -- "Create a short prep plan for this workshop repository." | tee "logs/workshop-check-persistent-1.log"
  npm run demo:persistent -- "Resume previous context and provide the next concrete action." | tee "logs/workshop-check-persistent-2.log"
fi

log "preflight: PASS"
