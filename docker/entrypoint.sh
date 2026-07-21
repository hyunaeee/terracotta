#!/bin/sh
set -eu

DATA_DIR="${TERRACOTTA_DATA_DIR:-/data}"
RUNTIME_ENV_FILE="/tmp/terracotta-runtime.env"

mkdir -p "$DATA_DIR/wrangler" "$DATA_DIR/secrets"
node /app/docker/prepare-runtime-env.mjs "$RUNTIME_ENV_FILE" "$DATA_DIR"

exec wrangler dev \
  --config /app/dist/server/wrangler.json \
  --local \
  --persist-to "$DATA_DIR/wrangler" \
  --env-file "$RUNTIME_ENV_FILE" \
  --ip 0.0.0.0 \
  --port "${PORT:-8080}" \
  --log-level info \
  --show-interactive-dev-session=false
