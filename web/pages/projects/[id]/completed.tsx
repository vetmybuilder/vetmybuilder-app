// web/pages/projects/[id]/completed.tsx
//
// The standalone "completed project" page is retired. Post-CR3 the
// homeowner no longer has any surface for browsing completed jobs -
// closures are archived in the DB and effectively invisible to them.
// Any stale link, bookmark, or in-app redirect that still points here
// gets bounced back to /projects.
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function CompletedProjectRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return null;
}
