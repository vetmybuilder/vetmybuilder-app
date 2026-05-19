// scripts/create-firebase-user-with-uid.js
//
// One-shot rescue: create a Firebase Auth user with a specific UID,
// email and password. Used when a MySQL users row exists for a UID but
// the matching Firebase Auth account is missing (e.g. seeded user that
// never had a Firebase entry, or auth state lost).
//
// Usage:
//   node scripts/create-firebase-user-with-uid.js <uid> <email> <password>
//
// Reads FIREBASE_ADMIN_CREDENTIALS_JSON from the local .env. Run from
// the repo root on prod (or wherever .env lives).

require("dotenv").config();
const admin = require("firebase-admin");

async function main() {
  const [uid, email, password] = process.argv.slice(2);
  if (!uid || !email || !password) {
    console.error(
      "Usage: node scripts/create-firebase-user-with-uid.js <uid> <email> <password>",
    );
    process.exit(2);
  }

  const credsJson = process.env.FIREBASE_ADMIN_CREDENTIALS_JSON;
  if (!credsJson) {
    console.error("FIREBASE_ADMIN_CREDENTIALS_JSON not set in env");
    process.exit(2);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(credsJson);
  } catch (e) {
    console.error("FIREBASE_ADMIN_CREDENTIALS_JSON is not valid JSON:", e.message);
    process.exit(2);
  }

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  try {
    const user = await admin.auth().createUser({
      uid,
      email,
      password,
      emailVerified: true,
    });
    console.log("Created Firebase user:", user.uid, user.email);
  } catch (err) {
    if (err?.code === "auth/uid-already-exists") {
      console.log("UID already exists - updating password instead");
      await admin.auth().updateUser(uid, { email, password });
      console.log("Updated existing Firebase user:", uid);
    } else if (err?.code === "auth/email-already-exists") {
      console.error(
        "ERROR: email is already in use by a DIFFERENT UID - delete that other Firebase user first",
      );
      process.exit(1);
    } else {
      console.error("Firebase error:", err?.code, err?.message);
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
