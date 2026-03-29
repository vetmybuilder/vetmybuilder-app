// server/routes/__test__/auth/id-token.post.js

/**
 * POST /api/__test__/auth/id-token
 *
 * - Creates Firebase custom token via admin SDK (local)
 * - Exchanges it for an idToken via Auth emulator (or Google) (network)
 *
 * Under parallel Playwright workers, the auth emulator exchange can intermittently
 * throw "fetch failed". That can be harmless if callers retry.
 *
 * So we:
 *  1) cache idTokens per UID for a short TTL
 *  2) retry exchange with backoff + per-attempt timeout
 *  3) rate-limit "exchange failed" logs to avoid spam
 *
 * EXTRA (TEST DB ONLY):
 *  - If ctx.mysqlQuery is available, we ensure the uid exists in MySQL `users`
 *    and (when uid matches TEST_ADMIN_USER_UID) ensure `user_roles` has admin.
 *    This prevents admin API tests returning 403 when role seeding drifts.
 */

module.exports = (router, ctx) => {
  const {
    assertTestAccess,
    admin,
    resolveFirebaseApiKey,
    fetch = global.fetch,
    mysqlQuery, // <-- optional (only present in MySQL mode)
  } = ctx;

  const log = ctx.log || console;
  const TAG = "[test/auth/id-token.post]";
  const ROUTE = "/__test__/auth/id-token";

  // ---- Simple in-memory cache (per node process) ----
  const TOKEN_TTL_MS = Number(process.env.TEST_ID_TOKEN_TTL_MS || 60_000); // 60s
  const tokenCache = ctx.__test_id_token_cache || new Map();
  ctx.__test_id_token_cache = tokenCache;

  // ---- Log rate limiting ----
  const LOG_FAILS = process.env.LOG_TEST_AUTH_EXCHANGE_FAIL === "1";
  const FAIL_LOG_COOLDOWN_MS = Number(
    process.env.TEST_ID_TOKEN_FAIL_LOG_COOLDOWN_MS || 10_000,
  );
  const failLogSeen = ctx.__test_id_token_fail_log_seen || new Map();
  ctx.__test_id_token_fail_log_seen = failLogSeen;

  function now() {
    return Date.now();
  }

  function getCached(uid) {
    const hit = tokenCache.get(uid);
    if (!hit) return null;
    if (hit.expiresAt <= now()) {
      tokenCache.delete(uid);
      return null;
    }
    return hit.idToken;
  }

  function setCached(uid, idToken) {
    tokenCache.set(uid, { idToken, expiresAt: now() + TOKEN_TTL_MS });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function maybeLogExchangeFail(uid, ms, errMsg) {
    const last = failLogSeen.get(uid) || 0;
    if (now() - last < FAIL_LOG_COOLDOWN_MS) return;
    failLogSeen.set(uid, now());

    const payload = { uid, ms, error: errMsg };
    if (LOG_FAILS) log.warn(payload, `${TAG} exchange failed (retry timeout)`);
    else log.debug?.(payload, `${TAG} exchange failed (retry timeout)`);
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
  }

  async function exchangeCustomTokenForIdToken({
    baseUrl,
    apiKey,
    customToken,
    uid,
  }) {
    const url = `${baseUrl}/accounts:signInWithCustomToken?key=${apiKey}`;

    const start = now();
    const attempts = Number(process.env.TEST_ID_TOKEN_EXCHANGE_RETRIES || 4);
    const timeoutMs = Number(
      process.env.TEST_ID_TOKEN_EXCHANGE_TIMEOUT_MS || 6000,
    );

    let lastErr = null;

    for (let i = 1; i <= attempts; i++) {
      try {
        const resp = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: customToken,
              returnSecureToken: true,
            }),
          },
          timeoutMs,
        );

        const data = await resp.json().catch(() => ({}));

        if (resp.ok && data?.idToken) {
          return { ok: true, idToken: data.idToken };
        }

        lastErr = new Error(
          `exchange failed (status=${resp.status}) details=${JSON.stringify(data)}`,
        );
      } catch (e) {
        lastErr = e;
      }

      if (i < attempts) await sleep(150 * i);
    }

    const ms = now() - start;
    maybeLogExchangeFail(uid, ms, lastErr?.message || String(lastErr));

    return { ok: false, error: lastErr?.message || "exchange failed" };
  }

  function emailForUid(uid) {
    const adminUid = String(process.env.TEST_ADMIN_USER_UID || "").trim();
    const userUid = String(process.env.TEST_USER_UID || "").trim();

    if (adminUid && uid === adminUid) return process.env.E2E_ADMIN_USER_EMAIL;
    if (userUid && uid === userUid)
      return process.env.E2E_HOME_OWNER_USER_EMAIL;

    return null;
  }

  async function ensureMysqlUserAndRole(uid) {
    if (!mysqlQuery) return;

    const adminUid = String(process.env.TEST_ADMIN_USER_UID || "").trim();
    const isAdmin = adminUid && uid === adminUid;

    const email = emailForUid(uid);

    try {
      // Ensure users row exists (email best-effort)
      await mysqlQuery(
        `
        INSERT INTO users (uid, email, createdAt)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          email = COALESCE(VALUES(email), email)
        `,
        [uid, email],
      );

      // Ensure role row exists (admin when matching admin uid, else user)
      await mysqlQuery(
        `
        INSERT INTO user_roles (uid, role)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE role = VALUES(role)
        `,
        [uid, isAdmin ? "admin" : "user"],
      );
    } catch (e) {
      log.warn(
        { uid, error: e?.message || String(e) },
        `${TAG} ensureMysqlUserAndRole failed`,
      );
    }
  }

  router.post(ROUTE, async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const uid = String(req.body?.uid || "").trim();
    log.info({ uid }, `${TAG} hit`);

    try {
      if (!uid) {
        log.warn(`${TAG} missing uid`);
        return res.status(400).json({ error: "uid required" });
      }

      // Ensure DB role/user BEFORE returning cached token (so admin routes don’t 403)
      await ensureMysqlUserAndRole(uid);

      const cached = getCached(uid);
      if (cached) {
        return res.json({
          ok: true,
          idToken: cached,
          token: cached,
          cached: true,
        });
      }

      if (!admin?.apps?.length) {
        log.error(`${TAG} firebase admin not initialised`);
        return res
          .status(503)
          .json({ error: "firebase admin not initialised" });
      }

      const apiKey = resolveFirebaseApiKey?.() || process.env.FIREBASE_API_KEY;
      if (!apiKey) {
        log.error(`${TAG} missing Firebase Web API key`);
        return res.status(500).json({ error: "Missing Web API key" });
      }

      const customToken = await admin.auth().createCustomToken(uid);
      log.info(`${TAG} custom token created`);

      const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
      const baseUrl = emulatorHost
        ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`
        : `https://identitytoolkit.googleapis.com/v1`;

      const exchanged = await exchangeCustomTokenForIdToken({
        baseUrl,
        apiKey,
        customToken,
        uid,
      });

      if (!exchanged.ok) {
        return res
          .status(500)
          .json({ error: "exchange failed", details: exchanged.error });
      }

      setCached(uid, exchanged.idToken);

      log.info(`${TAG} success`);
      return res.json({
        ok: true,
        idToken: exchanged.idToken,
        token: exchanged.idToken,
      });
    } catch (e) {
      log.error(`${TAG} unhandled error`, { error: e?.message || e });
      return res.status(500).json({ error: "failed to mint id token" });
    }
  });

  if (!ctx.__logged_test_id_token_post) {
    ctx.__logged_test_id_token_post = true;
    log.info({ route: `/api${ROUTE}`, method: "POST" }, "[routes] mounted");
  }
};
