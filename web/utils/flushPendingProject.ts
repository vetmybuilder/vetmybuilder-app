// web/utils/flushPendingProject.ts
//
// Shared post-auth helper for the engagement-first signup flow. A guest
// fills the wizard at /projects/new, hits submit, and is bounced to
// /signup with the full project payload stashed in sessionStorage under
// `vmb:pendingProjectPayload`. After auth completes (email signup, OAuth
// signup-complete, or login), call this helper to POST the queued
// project under the new uid and resolve the post-auth target.
//
// Usage:
//
//   const target = await flushPendingProject(api);
//   if (target) router.replace(target);   // /projects/{id}?justCreated=1
//   else router.replace(yourNormalTarget); // unchanged login/signup flow
//
// On failure (network, validation, etc.) the helper clears the stashed
// payload so the user isn't trapped in a retry loop. They lose the
// draft but keep their account and can post fresh from /projects/new.

const KEY = "vmb:pendingProjectPayload";

type ApiClient = {
  post: (path: string, body: unknown) => Promise<any>;
};

export async function flushPendingProject(
  api: ApiClient,
): Promise<string | null> {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    sessionStorage.removeItem(KEY);
  } catch {}

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  try {
    const res = await api.post("/api/projects", payload);
    const data = res?.data ?? res;
    const id = data?.project?.id;
    if (!id) {
      return null;
    }
    return `/projects/${id}?justCreated=1`;
  } catch {
    return null;
  }
}
