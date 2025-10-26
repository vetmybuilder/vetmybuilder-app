// import { test as base } from "@playwright/test";

// const STATE_PATH = process.env.E2E_STATE_PATH || ".auth/state.json";
// const API_PREFIX = process.env.E2E_API_PREFIX || "/api";

// export const test = base.extend<{
//   idToken: () => Promise<string>;
//   sessionRequest: {
//     get: (url: string, opts?: any) => Promise<ReturnType<typeof base.request.get>>;
//     post: (url: string, opts?: any) => Promise<ReturnType<typeof base.request.post>>;
//     put: (url: string, opts?: any) => Promise<ReturnType<typeof base.request.put>>;
//     delete: (url: string, opts?: any) => Promise<ReturnType<typeof base.request.delete>>;
//   };
// }>({
//   // assumes your existing auto-login fixture already navigates to /projects
//   idToken: async ({ page }, use) => {
//     const fn = async () => {
//       const tok = await page.evaluate(() => {
//         function fromLS() {
//           for (let i = 0; i < localStorage.length; i++) {
//             const k = localStorage.key(i);
//             if (!k || !k.startsWith("firebase:authUser:")) continue;
//             const raw = localStorage.getItem(k);
//             if (!raw) continue;
//             try {
//               const obj = JSON.parse(raw);
//               const t = obj?.stsTokenManager?.accessToken;
//               if (t && typeof t === "string") return t;
//             } catch {}
//           }
//           return null;
//         }
//         let t = fromLS();
//         return t || "";
//       });
//       if (!tok) throw new Error("idToken not found in localStorage");
//       return tok;
//     };
//     await use(fn);
//   },

//   // Bind API calls to the SAME browser session + add Bearer header per call
//   sessionRequest: async ({ page, idToken }, use) => {
//     const wrap = {
//       get: async (url: string, opts: any = {}) =>
//         page.request.get(url.startsWith("/") ? url : `${API_PREFIX}${url}`, {
//           ...opts,
//           headers: {
//             Authorization: `Bearer ${await idToken()}`,
//             ...(opts.headers || {}),
//           },
//         }),
//       post: async (url: string, opts: any = {}) =>
//         page.request.post(url.startsWith("/") ? url : `${API_PREFIX}${url}`, {
//           ...opts,
//           headers: {
//             Authorization: `Bearer ${await idToken()}`,
//             ...(opts.headers || {}),
//           },
//         }),
//       put: async (url: string, opts: any = {}) =>
//         page.request.put(url.startsWith("/") ? url : `${API_PREFIX}${url}`, {
//           ...opts,
//           headers: {
//             Authorization: `Bearer ${await idToken()}`,
//             ...(opts.headers || {}),
//           },
//         }),
//       delete: async (url: string, opts: any = {}) =>
//         page.request.delete(url.startsWith("/") ? url : `${API_PREFIX}${url}`, {
//           ...opts,
//           headers: {
//             Authorization: `Bearer ${await idToken()}`,
//             ...(opts.headers || {}),
//           },
//         }),
//     };

//     // save storage state so the session is reusable for other tests/workers
//     await page.context().storageState({ path: STATE_PATH });

//     await use(wrap);
//   },
// });
