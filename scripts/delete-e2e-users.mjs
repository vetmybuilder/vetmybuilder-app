#!/usr/bin/env node
/* Delete Firebase Auth users by email pattern or anonymously — and supports deleting ALL users.
   Matchers (can be combined unless --all/--onlyAnonymous is used):
     --prefix e2e+             (email starts with)
     --suffix @example.test    (email ends with)
     --domain example.com      (email ends with @example.com)
   Anonymous controls:
     --includeAnonymous        (include anonymous users in deletion set)
     --onlyAnonymous           (delete ONLY anonymous users; ignores email matchers)
   Nuclear option:
     --all                     (delete ALL users; you can still add --olderThan)
   Other options:
     --olderThan <hours>       Only delete accounts older than N hours (default 0)
     --project <id>            Firebase/GC project id (e.g. vetmybuilder)
     --yes                     Actually delete (otherwise DRY-RUN)

   Examples:
     node scripts/delete-test-users.mjs --all --project vetmybuilder
     node scripts/delete-test-users.mjs --all --olderThan 24 --project vetmybuilder --yes
     node scripts/delete-test-users.mjs --prefix e2e+ --domain example.com --project vetmybuilder
     node scripts/delete-test-users.mjs --onlyAnonymous --olderThan 12 --project vetmybuilder --yes

   Auth (pick ONE):
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
     gcloud auth application-default login   (ensure gcloud uses Python 3.11)
*/

import admin from "firebase-admin";
import fs from "node:fs";

/* ---------------------- arg parsing ---------------------- */
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) {
      args[k] = v;
      i++;
    } else {
      args[k] = true;
    }
  }
  return args;
}
const args = parseArgs(process.argv);

const prefix = args.prefix ? String(args.prefix) : undefined; // "e2e+"
const suffix = args.suffix ? String(args.suffix).toLowerCase() : undefined; // "@example.test"
const domain = args.domain ? String(args.domain).toLowerCase() : undefined; // "example.com"
const includeAnonymous = Boolean(args.includeAnonymous || args.onlyAnonymous);
const onlyAnonymous = Boolean(args.onlyAnonymous);
const deleteAll = Boolean(args.all);
const olderThanHours = args.olderThan ? Number(args.olderThan) : 0;
const reallyDelete = Boolean(args.yes);

/* ---------------------- project resolution ---------------------- */
function resolveProjectId(cliProject) {
  if (cliProject) return cliProject;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const json = JSON.parse(
        fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
      );
      if (json.project_id) return json.project_id;
    } catch {}
  }
  return undefined;
}
const projectId = resolveProjectId(args.project);

/* ---------------------- init Admin SDK (ADC or SA) ---------------------- */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

/* ---------------------- build email matcher (ignored for --all / --onlyAnonymous) ---------------------- */
function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let EMAIL_RE;
if (deleteAll || onlyAnonymous) {
  EMAIL_RE = undefined; // not used
} else if (prefix && domain) {
  EMAIL_RE = new RegExp(`^${escRe(prefix)}\\S*@${escRe(domain)}$`, "i");
} else if (prefix && suffix) {
  EMAIL_RE = new RegExp(`^${escRe(prefix)}\\S*${escRe(suffix)}$`, "i");
} else if (prefix) {
  EMAIL_RE = new RegExp(`^${escRe(prefix)}`, "i");
} else if (suffix) {
  if (!suffix.startsWith("@")) {
    console.error(
      "❌ --suffix must start with '@' (e.g., --suffix @example.test)"
    );
    process.exit(1);
  }
  EMAIL_RE = new RegExp(`${escRe(suffix)}$`, "i");
} else if (domain) {
  EMAIL_RE = new RegExp(`@${escRe(domain)}$`, "i");
} else {
  // default fallback: end with @example.test
  EMAIL_RE = new RegExp(`${escRe("@example.test")}$`, "i");
}

/* ---------------------- helpers ---------------------- */
const hoursSince = (ts) => (Date.now() - new Date(ts).getTime()) / 36e5;
function isAnonymousUser(u) {
  const hasProviders =
    Array.isArray(u.providerData) && u.providerData.length > 0;
  return !u.email && !u.phoneNumber && !hasProviders;
}

async function listMatchingUsers() {
  const hits = [];
  let next;
  do {
    const { users, pageToken } = await admin.auth().listUsers(1000, next);
    for (const u of users) {
      const anon = isAnonymousUser(u);

      // Selection logic
      let keep = false;
      if (deleteAll) {
        keep = true;
      } else if (onlyAnonymous) {
        keep = anon;
      } else {
        const email = (u.email || "").toLowerCase();
        const emailMatches = EMAIL_RE ? EMAIL_RE.test(email) : false;
        keep = includeAnonymous ? emailMatches || anon : emailMatches;
      }

      if (!keep) continue;

      // Age filter
      if (olderThanHours > 0) {
        const created = u.metadata?.creationTime;
        if (!created || hoursSince(created) < olderThanHours) continue;
      }

      hits.push(u);
    }
    next = pageToken;
  } while (next);
  return hits;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ---------------------- main ---------------------- */
(async function main() {
  const label = deleteAll
    ? "[ALL users]"
    : onlyAnonymous
    ? "[ONLY anonymous]"
    : `${EMAIL_RE}${includeAnonymous ? " + anonymous" : ""}`;

  console.log(`🔎 Project: ${projectId || "(ADC default)"} | Match: ${label}`);
  if (olderThanHours > 0)
    console.log(`⏳ Only users older than ${olderThanHours}h`);
  console.log(
    `🔒 Dry-run: ${reallyDelete ? "NO (will delete)" : "YES (no deletions)"}`
  );

  const matches = await listMatchingUsers();
  if (matches.length === 0) {
    console.log("✅ No matching users.");
    return;
  }

  const anonCount = matches.filter(isAnonymousUser).length;
  const emailCount = matches.length - anonCount;

  console.log(
    `➡️  Found ${matches.length} user(s) [email-matched: ${emailCount}, anonymous: ${anonCount}]:`
  );
  for (const u of matches) {
    const tag = isAnonymousUser(u)
      ? "anonymous"
      : u.providerData?.map((p) => p.providerId).join(",") || "email";
    console.log(
      `   - ${u.uid}  ${u.email || "(no email)"}  providers=[${tag}]  created=${
        u.metadata?.creationTime
      }`
    );
  }

  if (!reallyDelete) {
    console.log("\nℹ️ Dry-run complete. Pass --yes to actually delete.");
    return;
  }

  let ok = 0,
    fail = 0;
  for (const uids of chunk(
    matches.map((u) => u.uid),
    1000
  )) {
    const res = await admin.auth().deleteUsers(uids);
    ok += res.successCount;
    fail += res.failureCount;
    (res.errors || []).forEach((e) =>
      console.warn(`⚠️  Failed: ${uids[e.index]} — ${e.error?.message}`)
    );
  }
  console.log(`\n🧹 Done. Deleted: ${ok}, Failed: ${fail}`);
})().catch((err) => {
  console.error("❌ Error:", err?.message || err);
  process.exit(1);
});
