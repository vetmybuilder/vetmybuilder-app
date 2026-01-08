type Runtime = {
  env: string;
  webBaseUrl: string;
  apiBaseUrl: string;
  shard: string;
  worker: number;
  dbName: string;
};

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function getShard(): string {
  // Supports Playwright shards: --shard=1/3
  const shard = process.env.PW_TEST_SHARD || process.env.SHARD;
  return shard ? shard.replace("/", "_") : "s1_1";
}

export function getRuntime(workerIndex = 0): Runtime {
  const shard = getShard();
  const worker = workerIndex;

  const dbPrefix = env("TEST_DB_NAME_PREFIX", "vetmybuilder_test");
  const dbName = `${dbPrefix}_${shard}_w${worker}`;

  return {
    env: env("TEST_ENV", "local"),
    webBaseUrl: env("WEB_BASE_URL"),
    apiBaseUrl: env("API_BASE_URL"),
    shard,
    worker,
    dbName,
  };
}
