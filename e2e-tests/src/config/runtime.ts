// e2e-tests/src/config/runtime.ts
import fs from "node:fs";

export type Runtime = {
  env: string;
  webBaseUrl: string;
  apiBaseUrl: string;
  shard: string;
  shardIndex: number;
  worker: number;
  dbName: string;
  port: number;
};

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getShardValue(): string | undefined {
  return (
    process.env.TEST_SHARD || process.env.PW_TEST_SHARD || process.env.SHARD
  );
}

function parseShardIndex(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  // Playwright format "1/4" => index 0
  if (raw.includes("/")) {
    const [current] = raw.split("/");
    const currentNumber = Number(current);
    if (Number.isFinite(currentNumber) && currentNumber > 0)
      return currentNumber - 1;
    return 0;
  }

  // "0", "1", "2" => index
  if (/^\d+$/.test(raw)) {
    const indexNumber = Number(raw);
    if (Number.isFinite(indexNumber) && indexNumber >= 0) return indexNumber;
  }

  return undefined;
}

function shardLabel(shardIndex: number, totalShards: number): string {
  return `s${shardIndex + 1}_${totalShards}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function isDockerLike(): boolean {
  return (
    process.env.DOCKER === "1" ||
    process.env.IN_DOCKER === "1" ||
    fs.existsSync("/.dockerenv")
  );
}

export function getRuntime(
  workerIndex = 0,
  shardIndexOverride?: number,
): Runtime {
  const totalShards = Number(requireEnv("TEST_TOTAL_SHARDS", "4"));

  // Prefer explicit override, then env shard, else default to workerIndex for local parallel runs
  const envShardIndex = parseShardIndex(getShardValue());
  const shardIndex =
    typeof shardIndexOverride === "number"
      ? shardIndexOverride
      : typeof envShardIndex === "number"
        ? envShardIndex
        : clamp(workerIndex, 0, Math.max(0, totalShards - 1));

  const shard = shardLabel(shardIndex, totalShards);

  // DB name MUST be shard-specific (NOT worker-specific) so server + tests use same DB
  const dbName =
    process.env.TEST_DB_NAME ||
    (() => {
      const dbPrefix = requireEnv("TEST_DB_NAME_PREFIX", "vetmybuilder_test");
      return `${dbPrefix}_${shard}`;
    })();

  const dockerLike = isDockerLike();

  const webPort = Number(requireEnv("WEB_PORT", "3000"));
  const apiBasePort = Number(requireEnv("API_BASE_PORT", "3100"));
  const apiPort = apiBasePort + shardIndex;

  const webBaseUrl =
    process.env.WEB_BASE_URL ||
    process.env.UI_BASE_URL ||
    (dockerLike ? `http://web:${webPort}` : `http://127.0.0.1:${webPort}`);

  // IMPORTANT:
  // - Host runs: shard uses 3100+shardIndex
  // - Docker runs: each shard uses its own server container (server-w{shardIndex}) on 3100
  const apiBaseUrl =
    process.env.API_BASE_URL ||
    process.env.TEST_API_BASE_URL ||
    (dockerLike
      ? `http://server-w${shardIndex}:3100`
      : `http://127.0.0.1:${apiPort}`);

  return {
    env: requireEnv("TEST_ENV", "local"),
    shard,
    shardIndex,
    worker: workerIndex,
    dbName,
    port: apiPort,
    webBaseUrl,
    apiBaseUrl,
  };
}
