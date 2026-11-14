#!/bin/sh
# Starts the public demo on Railway: one service, API + web on one origin, offline mode.
# Every default can be overridden in the service's Variables.
set -eu

export HOST="${HOST:-0.0.0.0}"                       # Railway routes to the container, not loopback
export WEB_DIR="${WEB_DIR:-dist/web}"
export BIFROST_IMPLEMENTATION="${BIFROST_IMPLEMENTATION:-mock}"
export TAVILY_MODE="${TAVILY_MODE:-mock}"
export ALLOW_PAID_REQUESTS="${ALLOW_PAID_REQUESTS:-false}"
export TAVILY_MAX_REQUESTS="${TAVILY_MAX_REQUESTS:-0}"
export DATA_DIR="${DATA_DIR:-.local/data}"

# The saved live records behind the demo are not tracked in .local/data, so load them.
mkdir -p "$DATA_DIR"
cp docs/evidence/local-rerun-2026-11-07/graph-repair-94313e39-41f0-497e-b215-f2f43a7196a3.json "$DATA_DIR/track-d-94313e39-41f0-497e-b215-f2f43a7196a3.json"
cp docs/evidence/local-rerun-2026-11-07/tavily-live-8.json "$DATA_DIR/analysis-994ce642-e336-4273-9ce3-37e8d01c2a52.json"

exec node dist/api/server.js
