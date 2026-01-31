// import type { BrowserContext, Page } from "@playwright/test";

// export async function resetUiSession(page: Page, context: BrowserContext) {
//   // 1) Clear cookies (auth/session)
//   await context.clearCookies();

//   // 2) Navigate to app origin
//   // Storage APIs only work correctly once we’re on the site
//   await page.goto("/", { waitUntil: "domcontentloaded" });

//   // 3) Clear browser storage (local/session + IndexedDB)
//   await page.evaluate(async () => {
//     try {
//       localStorage.clear();
//       sessionStorage.clear();
//     } catch {}

//     // IndexedDB (important for Firebase auth persistence)
//     try {
//       // Modern browsers
//       // @ts-ignore
//       if (typeof indexedDB.databases === "function") {
//         // @ts-ignore
//         const dbs = await indexedDB.databases();
//         for (const db of dbs || []) {
//           if (db?.name) {
//             indexedDB.deleteDatabase(db.name);
//           }
//         }
//       } else {
//         // Fallback for older browsers
//         const common = [
//           "firebaseLocalStorageDb",
//           "firebase-installations-database",
//           "firebase-heartbeat-database",
//         ];
//         for (const name of common) {
//           indexedDB.deleteDatabase(name);
//         }
//       }
//     } catch {}
//   });

//   // 4) Reload so the app boots with a genuinely clean client state
//   await page.reload({ waitUntil: "domcontentloaded" });
// }
