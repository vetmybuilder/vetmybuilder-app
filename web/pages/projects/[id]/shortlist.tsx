// web/pages/projects/[id]/shortlist.tsx
//
// Legacy standalone shortlist page. Superseded by the inline swipe deck
// on `/projects/[id]` (see ProjectSwipeDesktop / ProjectSwipeMobile).
// Gated with a 404 so the route can't be reached while the full code
// removal (page body + ShortlistSection + compare page + e2e PO/fixture)
// is queued in the backlog for a dedicated cleanup branch.

import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  return { notFound: true };
};

export default function LegacyShortlistPage() {
  return null;
}
