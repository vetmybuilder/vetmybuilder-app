// scripts/print-firebase-project-id.js
// Ensures firebase emulators use same projectId as your server config

require("dotenv").config();

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "vetmybuilder";

process.stdout.write(projectId);
