// web/pages/projects/archived.tsx
import type { GetServerSideProps } from "next";

export default function ArchivedRedirect() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  // Preserve useful filters/pagination, drop any incoming "status",
  // and force the correct tab.
  const keepKeys = new Set([
    "page",
    "pageSize",
    "name",
    "type",
    "location",
    "property",
    "order",
    "sort",
  ]);
  const params = new URLSearchParams();

  for (const [k, v] of Object.entries(query)) {
    if (keepKeys.has(k) && typeof v === "string") params.set(k, v);
  }

  // Force the archived tab and remove any conflicting status filter
  params.set("tab", "archived");

  const destination = `/projects?${params.toString()}`;

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};
