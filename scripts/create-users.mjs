#!/usr/bin/env node
/**
 * Create Firebase Auth users from the CLI.
 * Examples:
 *   # 1 user with explicit email + password
 *   node scripts/create-users.mjs --email alice@example.test --password Passw0rd! --project vetmybuilder
 *
 *   # 10 test users like e2e+<timestamp>-<n>@example.test, marked verified
 *   node scripts/create-users.mjs --count 10 --prefix e2e+ --domain example.test --verified --project vetmybuilder
 *
 *   # Add custom claims
 *   node scripts/create-users.mjs --count 3 --prefix qa+ --domain example.test --claims '{"role":"qa"}'
 *
 * Auth: set ONE of:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   gcloud auth application-default login   (ensure gcloud uses Python 3.11)
 */
import admin from "firebase-admin";
import fs from "node:fs";
import crypto from "node:crypto";

/* ---------------- args ---------------- */
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

const explicitEmail = args.email ? String(args.email) : undefined;
const password = args.password ? String(args.password) : undefined;
const count = args.count ? Math.max(1, Number(args.count)) : 1;
const prefix = args.prefix ? String(args.prefix) : "e2e+";
const domain = args.domain ? String(args.domain).toLowerCase() : "example.test";
const verified = Boolean(args.verified);
const claims = args.claims ? JSON.parse(String(args.claims)) : undefined;
const outCsv = args.out ? String(args.out) : undefined;

/* --------------- project detection --------------- */
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

/* --------------- init admin --------------- */
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

/* --------------- helpers --------------- */
function randSuffix(n = 6) {
  return crypto
    .randomBytes(Math.ceil(n / 2))
    .toString("hex")
    .slice(0, n);
}
function makeEmail(i) {
  if (explicitEmail) return explicitEmail;
  const ts = Date.now();
  return `${prefix}${ts}-${i}-${randSuffix(4)}@${domain}`;
}

async function createOne(i) {
  const email = makeEmail(i);
  const user = await admin.auth().createUser({
    email,
    emailVerified: verified,
    ...(password ? { password } : {}),
  });
  if (claims && Object.keys(claims).length) {
    await admin.auth().setCustomUserClaims(user.uid, claims);
  }
  return { uid: user.uid, email };
}

/* --------------- main --------------- */
(async () => {
  console.log(`🔧 Project: ${projectId || "(ADC default)"}`);
  console.log(
    `➕ Creating ${count} user(s) ${
      explicitEmail
        ? `(fixed email: ${explicitEmail})`
        : `with pattern: ${prefix}<timestamp>-<n>-<rand>@${domain}`
    }`
  );
  if (password) console.log(`🔑 With password: [provided]`);
  if (verified) console.log(`✅ Marking emailVerified=true`);
  if (claims) console.log(`🏷️  Custom claims: ${JSON.stringify(claims)}`);

  const created = [];
  for (let i = 1; i <= count; i++) {
    try {
      const row = await createOne(i);
      created.push(row);
      console.log(`   - ${row.uid}  ${row.email}`);
    } catch (e) {
      console.error(`❌ Failed to create user #${i}:`, e?.message || e);
    }
  }

  if (outCsv) {
    const csv = ["uid,email"]
      .concat(created.map((r) => `${r.uid},${r.email}`))
      .join("\n");
    fs.writeFileSync(outCsv, csv, "utf8");
    console.log(`\n📝 Wrote ${created.length} rows to ${outCsv}`);
  }

  console.log(`\n✅ Done. Created ${created.length} user(s).`);
})().catch((err) => {
  console.error("❌ Error:", err?.message || err);
  process.exit(1);
});
