#!/usr/bin/env node
/**
 * scripts/create-dev-user.mjs
 *
 * Creates a local dev user in both the Firebase Auth emulator and MySQL.
 * Safe to run multiple times — idempotent.
 *
 * Prerequisites:
 *   - Firebase Auth emulator running (port 9099)
 *   - MySQL running with the dev database created and migrated
 *
 * Usage:
 *   node scripts/create-dev-user.mjs
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load only .env.e2e.local — this is what dev-manual-server.js loads.
// Deliberately NOT loading .env so MYSQL_DATABASE from a production config
// cannot shadow the local dev database name.
require("dotenv").config({ path: path.join(ROOT, ".env.e2e.local") });

const mysql = require("mysql2/promise");

// ---- Config ----
const USERS = [
  { email: "test@test.com",  password: "password", firstName: "Test",  lastName: "User",  role: "user"  },
  { email: "admin@test.com", password: "password", firstName: "Admin", lastName: "User",  role: "admin" },
];

const EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
  "127.0.0.1:9099";

const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASSWORD =
  process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || "";

// Derive database name the same way dev-manual-server.js does so they always
// target the same database.  Explicit MYSQL_DATABASE in .env.e2e.local wins;
// otherwise fall back to the default shard-0 name.
const MYSQL_DATABASE =
  process.env.MYSQL_DATABASE || "vetmybuilder_test_s1_4_w0";

const signUpUrl = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
const signInUrl = `http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;

async function getOrCreateFirebaseUser({ email, password }) {
  const res = await fetch(signUpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();

  if (!data.error) return { uid: data.localId, created: true };

  if (data.error.message === "EMAIL_EXISTS") {
    const signInRes = await fetch(signInUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const signInData = await signInRes.json();
    if (signInData.error)
      throw new Error(`Sign-in failed: ${signInData.error.message}`);
    return { uid: signInData.localId, created: false };
  }

  throw new Error(data.error.message);
}

// ---- Step 1: Firebase Auth emulator ----
console.log(`\n[1/2] Firebase Auth emulator  http://${EMULATOR_HOST}`);

const resolved = [];
for (const u of USERS) {
  try {
    const { uid, created } = await getOrCreateFirebaseUser(u);
    console.log(`      ${created ? "✓ Created" : "✓ Exists "}  ${u.email}  uid=${uid}`);
    resolved.push({ ...u, uid });
  } catch (e) {
    console.error(`\n  ✗ Firebase error for ${u.email}: ${e.message}`);
    console.error(
      "    Is the emulator running?  →  npm run dev:manual  (then rerun this script)"
    );
    process.exit(1);
  }
}

// ---- Step 2: MySQL ----
console.log(
  `\n[2/2] MySQL  ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`
);

let conn;
try {
  conn = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });

  for (const u of resolved) {
    // users row (profile)
    await conn.execute(
      `INSERT INTO users (uid, email, firstName, lastName, createdAt)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         email     = VALUES(email),
         firstName = VALUES(firstName),
         lastName  = VALUES(lastName)`,
      [u.uid, u.email, u.firstName, u.lastName]
    );

    // user_roles row
    await conn.execute(
      `INSERT INTO user_roles (uid, role)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [u.uid, u.role]
    );

    // Verify
    const [rows] = await conn.execute(
      `SELECT u.uid, u.email, u.firstName, u.lastName, r.role
       FROM users u
       LEFT JOIN user_roles r ON r.uid = u.uid
       WHERE u.uid = ? LIMIT 1`,
      [u.uid]
    );
    const row = rows[0];

    if (!row) {
      console.error(`  ✗ Row not found after upsert for ${u.email}`);
      process.exit(1);
    }

    if (!row.firstName || !row.lastName) {
      console.error(
        `\n  ✗ firstName/lastName still null for ${u.email} — the columns may not exist.`
      );
      console.error(
        "    Recreate the DB volume: docker compose -f docker-compose.parallel.local.yml down -v && docker compose -f docker-compose.parallel.local.yml up -d"
      );
      process.exit(1);
    }

    console.log(
      `      ✓ ${row.email}  firstName=${row.firstName}  role=${row.role}`
    );
  }
} catch (e) {
  console.error(`\n  ✗ MySQL error: ${e.message}`);
  if (e.code === "ER_NO_SUCH_TABLE") {
    console.error(
      "    A required table does not exist — start the server once first so migrations run, then rerun this script."
    );
  } else if (e.code === "ECONNREFUSED") {
    console.error(
      "    Cannot connect to MySQL — is the dev stack running?  →  docker compose -f docker-compose.parallel.local.yml up -d mysql"
    );
  }
  process.exit(1);
} finally {
  await conn?.end();
}

console.log(`
Done.  Database: ${MYSQL_DATABASE}

  test@test.com   / password   (role: user)
  admin@test.com  / password   (role: admin)

Next steps:
  1. If you were already logged in → log out, then log back in.
     The app only fetches your profile on login; a stale session won't pick up changes.
  2. Log in at http://localhost:3000
`);
