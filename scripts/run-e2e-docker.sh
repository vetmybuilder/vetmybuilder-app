#!/usr/bin/env bash
# Run all 4 E2E shards in Docker and return a non-zero exit code if any shard fails.
# Usage: ./scripts/run-e2e-docker.sh [extra docker compose args]
set -euo pipefail

COMPOSE_FILE="docker-compose.e2e.yml"
SHARDS=(pw-ui-1 pw-ui-2 pw-ui-3 pw-ui-4)

cd "$(dirname "$0")/.."

echo "=== Building images ==="
docker compose -f "$COMPOSE_FILE" build "$@"

echo "=== Starting infrastructure ==="
docker compose -f "$COMPOSE_FILE" up -d \
  mysql firebase web server-w0 server-w1 server-w2 server-w3

echo "=== Starting test shards ==="
docker compose -f "$COMPOSE_FILE" up -d "${SHARDS[@]}"

echo "=== Waiting for all shards to complete ==="
FAIL=0
for shard in "${SHARDS[@]}"; do
  container_id=$(docker compose -f "$COMPOSE_FILE" ps -q "$shard")
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
