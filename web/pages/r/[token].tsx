// web/pages/r/[token].tsx
//
// Legacy magic-link recommendation landing. The new design relies on
// the inline swipe deck on `/projects/[id]` for shortlist building, so
// the magic-link share + landing flow is no longer wired into the UX.
// Gated with a 404 so the route can't be reached while the full code
// removal (server routes, DB tables, dead client paths in OwnerProjectView,
// e2e PO/fixture) is queued in the backlog for a dedicated cleanup branch.

import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  return { notFound: true };
};

export default function LegacyMagicLinkPage() {
  return null;
}
