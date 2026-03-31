#!/usr/bin/env bash
# Run all 4 E2E shards in Docker and return a non-zero exit code if any shard fails.
# Usage: ./scripts/run-e2e-docker.sh [extra docker compose args]
set -euo pipefail

COMPOSE_FILE="docker-compose.e2e.yml"
SHARDS=(pw-ui-1 pw-ui-2 pw-ui-3 pw-ui-4 pw-ui-5)

cd "$(dirname "$0")/.."

echo "=== Building images ==="
docker compose -f "$COMPOSE_FILE" build "$@"

echo "=== Starting infrastructure ==="
# --force-recreate on mysql ensures init scripts re-run with the latest schema.
# Without this, Docker reuses an existing mysql container whose data/schema
# may be stale (e.g. missing columns added after the container was first created).
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans --force-recreate \
  mysql firebase \
  server-w0 server-w1 server-w2 server-w3 server-w4 \
  web-w0 web-w1 web-w2 web-w3 web-w4

echo "=== Starting test shards ==="
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans "${SHARDS[@]}"

echo "=== Waiting for all shards to complete ==="
FAIL=0
for shard in "${SHARDS[@]}"; do
  # Use --all so we find the container even if it has already exited.
  container_id=$(docker compose -f "$COMPOSE_FILE" ps --all -q "$shard")
  if [ -z "$container_id" ]; then
    echo "ERROR: could not find container for $shard"
    FAIL=1
    continue
  fi
  exit_code=$(docker wait "$container_id")
  if [ "$exit_code" = "0" ]; then
    echo "  $shard: PASSED"
  else
    echo "  $shard: FAILED (exit code $exit_code)"
    FAIL=1
  fi
done

echo "=== Tearing down ==="
docker compose -f "$COMPOSE_FILE" down

if [ "$FAIL" = "1" ]; then
  echo "=== E2E FAILED ==="
  exit 1
fi

echo "=== E2E PASSED ==="
exit 0
