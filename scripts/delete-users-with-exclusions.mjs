#!/usr/bin/env node

/**
 * Delete Firebase Auth users EXCEPT emails in an exclusion file.
 *
 * Usage:
 *   node scripts/delete-users-with-exclusions.mjs --all --excludeFile scripts/exclude.txt --project vetmybuilder
 *   node scripts/delete-users-with-exclusions.mjs --all --excludeFile exclude.txt --yes --project vetmybuilder
 */

import admin from "firebase-admin";
import fs from "node:fs";

/* ---------------------- arg parsing ---------------------- */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const excludeFile = args.excludeFile;
const reallyDelete = Boolean(args.yes);
const projectId =
  args.project ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT;

// ------------------ Read exclude list --------------------
let EXCLUDE_EMAILS = [];
if (excludeFile) {
  try {
    EXCLUDE_EMAILS = fs
      .readFileSync(excludeFile, "utf8")
      .split("\n")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  } catch (e) {
    console.error(`❌ Failed to read exclude file: ${excludeFile}`, e);
    process.exit(1);
  }
}

console.log(`🛡 Protected emails: ${EXCLUDE_EMAILS.join(", ")}`);

/* ---------------------- Firebase Admin Init ---------------------- */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

console.log(`🔎 Project: ${projectId || "(ADC default)"}`);

/* ---------------------- Helpers ---------------------- */
function isExcluded(email) {
  if (!email) return false;
  return EXCLUDE_EMAILS.includes(email.toLowerCase());
}

function isAnonymousUser(u) {
  const hasProviders =
    Array.isArray(u.providerData) && u.providerData.length > 0;
  return !u.email && !u.phoneNumber && !hasProviders;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------------------- Main logic ---------------------- */
async function listAllUsers() {
  let next;
  const all = [];
  do {
    const { users, pageToken } = await admin.auth().listUsers(1000, next);
    users.forEach((u) => all.push(u));
    next = pageToken;
  } while (next);
  return all;
}

(async function main() {
  console.log(
    `🔒 Dry-run: ${reallyDelete ? "NO (WILL delete)" : "YES (no deletion)"}`
  );

  let users;
  try {
    users = await listAllUsers();
  } catch (e) {
    console.error("❌ Firebase listUsers failed:", e);
    process.exit(1);
  }

  const deleteList = users.filter((u) => !isExcluded(u.email));

  console.log(`➡️ Total users: ${users.length}`);
  console.log(`➡️ Excluded: ${EXCLUDE_EMAILS.length}`);
  console.log(`➡️ To delete: ${deleteList.length}`);

  if (!reallyDelete) {
    console.log("\nℹ️ Dry-run complete. Pass --yes to actually delete.");
    return;
  }

  let ok = 0,
    fail = 0;

  for (const batch of chunk(
    deleteList.map((u) => u.uid),
    1000
  )) {
    const res = await admin.auth().deleteUsers(batch);
    ok += res.successCount;
    fail += res.failureCount;
    (res.errors || []).forEach((e) =>
      console.warn(
        `⚠️ Failed deleting UID ${batch[e.index]} — ${e.error?.message}`
      )
    );
  }

  console.log(`\n🧹 Done. Deleted: ${ok}, Failed: ${fail}`);
})();
