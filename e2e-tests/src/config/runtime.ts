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

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function getShardRaw(): string | undefined {
  // Prefer explicit shard index set by playwright config
  return (
    process.env.TEST_SHARD || process.env.PW_TEST_SHARD || process.env.SHARD
  );
}

function getShardIndexFromEnv(): number {
  const raw = getShardRaw();

  // Playwright format "1/4" => index 0
  if (raw && raw.includes("/")) {
    const [cur] = raw.split("/");
    const n = Number(cur);
    if (Number.isFinite(n) && n > 0) return n - 1;
    return 0;
  }

  // "0", "1", "2" => index
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return 0;
}

function getShardLabel(shardIndex: number, totalShards: number): string {
  // purely cosmetic label used in DB name
  return `s${shardIndex + 1}_${totalShards}`;
}

/**
 * getRuntime(workerIndex)
 * - used by tests at runtime (uses PW_TEST_SHARD from Playwright)
 *
 * getRuntime(workerIndex, shardIndexOverride)
 * - used by playwright.config.ts at config-load time to precompute servers
 */
export function getRuntime(
  workerIndex = 0,
  shardIndexOverride?: number,
): Runtime {
  const totalShards = Number(env("TEST_TOTAL_SHARDS", "4"));

  const shardIndex =
    typeof shardIndexOverride === "number"
      ? shardIndexOverride
      : getShardIndexFromEnv();

  const worker = workerIndex;

  const dbPrefix = env("TEST_DB_NAME_PREFIX", "vetmybuilder_test");
  const shard = getShardLabel(shardIndex, totalShards);
  const dbName = `${dbPrefix}_${shard}`;

  const basePort = Number(env("WEB_BASE_PORT", "3000"));
  const port = basePort + shardIndex;

  const apiBaseUrl = `http://localhost:${port}`;
  const webBaseUrl = apiBaseUrl; // API-only mode for e2e

  return {
    env: env("TEST_ENV", "local"),
    shard,
    shardIndex,
    worker,
    dbName,
    port,
    webBaseUrl,
    apiBaseUrl,
  };
}
