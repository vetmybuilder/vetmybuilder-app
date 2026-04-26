// pages/projects/[id].tsx
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { ChevronLeft, Home, MoreHorizontal, Pencil } from "lucide-react";
import { useProjectView } from "@/components/project/views/useProjectView";
import OwnerProjectView from "@/components/project/views/OwnerProjectView";
import TradesmanProjectView from "@/components/project/views/TradesmanProjectView";
import NeighbourProjectView from "@/components/project/views/NeighbourProjectView";
import Layout from "@/components/Layout";
import SwipeDeck from "@/components/project/SwipeDeck";
import ProjectActionsSheet from "@/components/project/ProjectActionsSheet";
import PhotoLightbox from "@/components/PhotoLightbox";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { useRouter } from "next/router";

type ViewerRole = "unknown" | "owner" | "trades" | "home";

function getShortProjectTitle(name?: string | null): string {
  if (!name) return "";
  let base = name.trim();
  if (base.toLowerCase().endsWith(" job post"))
    base = base.slice(0, -" job post".length).trim();
  const inIdx = base.toLowerCase().indexOf(" in ");
  if (inIdx > 0) base = base.slice(0, inIdx).trim();
  return base;
}

function ProjectSwipeMobile({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const api = useApi();
  const router = useRouter();
  const [matches, setMatches] = useState<{
    recommended: any[];
    subscribed: any[];
  } | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}/matches`);
        if (alive) setMatches(data);
      } catch {
        /* noop - mobile swipe deck is additive */
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId, api]);

  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Back nav row — chevron-left, title centred, edit (pencil) right */}
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-[15px] font-bold text-gray-500 tracking-tight truncate max-w-[60%] text-center">
          {projectTitle || "Find your builder"}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Edit project"
            onClick={() => router.push(`/projects/${projectId}/edit`)}
            className="inline-flex items-center gap-1.5 px-3 h-10 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[13px] tracking-tight"
          >
            <Pencil className="w-[14px] h-[14px]" />
            Edit
          </button>
          <button
            type="button"
            aria-label="More project actions"
            onClick={() => setActionsOpen(true)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      {matches && (
        <SwipeDeck
          projectId={String(projectId)}
          builders={[
            ...(matches.recommended || []),
            ...(matches.subscribed || []),
          ]}
          onInfo={(builder) => {
            const recId = (builder as any).recommendationId;
            if (builder.tier === "recommended" && recId) {
              router.push(
                `/builders/${recId}?projectId=${projectId}`,
              );
            } else {
              router.push(
                `/tradesman/${builder.uid}?projectId=${projectId}`,
              );
            }
          }}
          onMatch={(matchId) => router.push(`/match/${matchId}`)}
        />
      )}

      <ProjectActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        projectId={projectId}
        projectName={projectTitle}
      />
    </main>
  );
}

/* =====================================================================
 * Closed-project mobile view (read-only) — V1 Hero immersive
 * --------------------------------------------------------------------
 * Shown on mobile when the project status is `completed` or `archived`.
 * Pulls closure + closure photos from the same endpoints the desktop
 * uses; no new server work besides surfacing the winner's profile
 * picture URL.
 *
 * Layout:
 *   1. Full-bleed hero photo with floating back chevron + status pill
 *   2. Title overlaid on dark gradient at the bottom of the hero
 *   3. "Who did the work" winner card (avatar fallback chain)
 *   4. Project details card
 *   5. Description (if present)
 *   6. Photos grid — taps open a fullscreen carousel lightbox
 *
 * Avatar fallback chain (winner card):
 *   profilePictureUrl → first closure photo → initials disc
 * ===================================================================== */

type ClosedProjectMobileProps = {
  projectId: string;
  isCompleted: boolean;
  project: {
    id: number | string;
    name?: string | null;
    type?: string | null;
    location?: string | null;
    propertyType?: string | null;
    bedrooms?: number | null;
    description?: string | null;
    completedAt?: string | null;
    archivedAt?: string | null;
  };
};

type ClosurePhoto = {
  id?: number | string;
  fileUrl?: string | null;
  filePath?: string | null;
};

type Closure = {
  didGoAhead?: boolean;
  reasons?: string[];
  otherReason?: string | null;
  winner?: {
    id?: number;
    name?: string | null;
    company?: string | null;
    tradesmanUid?: string | null;
    profilePictureUrl?: string | null;
  } | null;
};

function ClosedProjectMobile({
  projectId,
  isCompleted,
  project,
}: ClosedProjectMobileProps) {
  const api = useApi();
  const router = useRouter();
  const [photos, setPhotos] = useState<ClosurePhoto[]>([]);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get<{ photos: ClosurePhoto[] }>(
          `/api/projects/${projectId}/close/photos`,
        );
        if (alive) setPhotos(Array.isArray(data?.photos) ? data.photos : []);
      } catch {
        if (alive) setPhotos([]);
      }
    })();
    (async () => {
      try {
        const { data } = await api.get<Closure>(
          `/api/projects/${projectId}/closure`,
        );
        if (alive) setClosure(data || null);
      } catch {
        if (alive) setClosure(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, projectId]);

  const photoUrls = useMemo(
    () =>
      photos
        .map((p) => p.fileUrl || (p.filePath ? String(p.filePath) : null))
        .filter((u): u is string => !!u),
    [photos],
  );

  const heroUrl = photoUrls[0] || null;
  const winnerName =
    closure?.winner?.company || closure?.winner?.name || null;
  const winnerAvatarUrl =
    closure?.winner?.profilePictureUrl || photoUrls[0] || null;
  const closedAt = isCompleted ? project.completedAt : project.archivedAt;
  const formattedDate = closedAt
    ? new Date(closedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  function openLightbox(at: number) {
    setLightboxIdx(at);
  }

  return (
    <main
      className="fixed inset-0 bg-gray-50 overflow-y-auto"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="closed-project-mobile"
    >
      {/* Hero — full-bleed photo with dark gradient + floating controls */}
      <header
        className="relative w-full bg-gray-200"
        style={{ aspectRatio: heroUrl ? "16 / 12" : "16 / 7" }}
      >
        {heroUrl ? (
          <button
            type="button"
            onClick={() => openLightbox(0)}
            aria-label="Open photo viewer"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroUrl})` }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #4338ca 100%)",
            }}
          />
        )}
        {/* Bottom dark gradient for legibility */}
        <div
          className="absolute left-0 right-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0))",
          }}
        />

        {/* Safe-area top spacer */}
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-0"
          style={{ height: "env(safe-area-inset-top)" }}
        />

        {/* Floating back button */}
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="absolute left-3.5 w-10 h-10 rounded-full flex items-center justify-center text-gray-900 shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(8px)",
          }}
          data-testid="closed-back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Floating status pill */}
        <span
          className="absolute right-3.5 inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-extrabold tracking-tight shadow-lg"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 14px)",
            background: isCompleted ? "#6366f1" : "rgba(255,255,255,0.95)",
            color: isCompleted ? "white" : "#374151",
          }}
        >
          {isCompleted ? "Completed" : "Archived"}
        </span>

        {/* Title overlay */}
        <div className="absolute left-5 right-5 bottom-4 text-white">
          <h1 className="text-[24px] font-extrabold tracking-tight leading-tight drop-shadow-md">
            {project.name || "Project"}
          </h1>
          <div
            className="mt-1.5 text-[12.5px] opacity-90 drop-shadow"
            style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}
          >
            {[
              isCompleted
                ? formattedDate
                  ? `Completed ${formattedDate}`
                  : "Completed"
                : formattedDate
                ? `Closed ${formattedDate}`
                : "Closed",
              project.location,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </header>

      {/* Winner card */}
      {isCompleted && winnerName && (
        <section className="px-5 pt-5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Who did the work
          </div>
          <div className="px-4 py-3.5 rounded-2xl bg-white border border-gray-200 flex items-center gap-3 shadow-sm">
            <WinnerAvatar
              name={winnerName}
              imageUrl={winnerAvatarUrl}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[14.5px] font-extrabold tracking-tight text-gray-900 truncate">
                {winnerName}
              </div>
              <div className="text-[11.5px] text-gray-500 mt-0.5">
                Hired through VetMyBuilder
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Project details */}
      <section className="px-5 pt-5">
        <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
          Project details
        </div>
        <dl className="rounded-2xl border border-gray-200 divide-y divide-gray-100 bg-white">
          <MetaRow label="Type" value={project.type} />
          <MetaRow label="Location" value={project.location} />
          <MetaRow
            label="Property"
            value={
              project.propertyType
                ? `${project.propertyType}${
                    project.bedrooms
                      ? `, ${project.bedrooms} bedroom${project.bedrooms === 1 ? "" : "s"}`
                      : ""
                  }`
                : null
            }
          />
        </dl>
      </section>

      {/* Description */}
      {project.description && project.description.trim() && (
        <section className="px-5 pt-5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Description
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">
            {project.description}
          </div>
        </section>
      )}

      {/* Photos grid (any beyond the hero) — taps open the lightbox */}
      {photoUrls.length > 1 && (
        <section className="px-5 pt-5 pb-8">
          <div className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-gray-500 mb-2">
            Photos
          </div>
          <div className="grid grid-cols-3 gap-2">
            {photoUrls.slice(1).map((src, i) => {
              const at = i + 1; // hero is index 0 in the lightbox order
              return (
                <button
                  key={at}
                  type="button"
                  aria-label={`Open photo ${at + 1}`}
                  onClick={() => openLightbox(at)}
                  className="aspect-square rounded-xl bg-cover bg-center bg-gray-100"
                  style={{ backgroundImage: `url(${src})` }}
                />
              );
            })}
          </div>
        </section>
      )}

      <div className="h-6" />

      {photoUrls.length > 0 && (
        <PhotoLightbox
          open={lightboxIdx !== null}
          photos={photoUrls}
          initialIndex={lightboxIdx ?? 0}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </main>
  );
}

function WinnerAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(imageUrl || null);

  // If the winner image fails to load, fall through to the initials disc.
  useEffect(() => {
    setSrc(imageUrl || null);
  }, [imageUrl]);

  if (src) {
    return (
      <span className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-gray-100">
        <img
          src={src}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setSrc(null)}
        />
      </span>
    );
  }

  const initials = (() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  return (
    <span
      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-extrabold text-[15px] shrink-0"
      style={{ background: "linear-gradient(135deg, #6ee7b7, #10b981)" }}
    >
      {initials}
    </span>
  );
}

/**
 * Mobile-only redirect for non-owner viewers. The desktop neighbour /
 * tradesman flows haven't been redesigned for mobile yet, and we don't
 * want pre-redesign layouts bleeding through. Sends the user back to
 * /projects (their own list) and shows nothing in the meantime.
 */
function NonOwnerMobileRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/projects");
  }, [router]);
  return (
    <main
      className="fixed inset-0 bg-white flex items-center justify-center"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="project-non-owner-redirect-mobile"
    >
      <div className="text-[13px] font-semibold text-gray-400">
        Returning to your projects…
      </div>
    </main>
  );
}

/**
 * Bare-route mobile 404 used when /projects/[id] errors out (e.g. project
 * deleted, viewer not permitted, or the API is briefly unavailable). Mirrors
 * the desktop 404 content but renders without site chrome so a stale render
 * never bleeds the old layout through.
 */
function ProjectErrorMobile() {
  return (
    <main
      className="fixed inset-0 bg-white overflow-y-auto flex items-center justify-center"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="project-view-error-mobile"
    >
      <div className="px-6 py-10 max-w-sm w-full text-center">
        <p className="text-[64px] font-black text-rose-500 leading-none mb-3">
          404
        </p>
        <h1 className="text-[20px] font-extrabold tracking-tight text-gray-900 mb-2">
          Project not found
        </h1>
        <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
          This project doesn&apos;t exist or is no longer available.
        </p>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-rose-500/25"
        >
          Back to projects
        </Link>
      </div>
    </main>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <dt className="text-[12px] text-gray-500 font-semibold">{label}</dt>
      <dd className="text-[13px] font-extrabold text-gray-900 text-right truncate max-w-[60%]">
        {value}
      </dd>
    </div>
  );
}

export default function ProjectViewPage() {
  const vm = useProjectView();
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [viewerRole, setViewerRole] = useState<ViewerRole>("unknown");

  // ---------------------------------------------------------
  // 1) Determine role (guest/homeowner/tradesman)
  // ---------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;

    // Not logged in → treat as neighbour (can view live projects, add recs)
    if (!user) {
      setViewerRole("home");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isTrades =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;

        setViewerRole(isTrades ? "trades" : "home");
      } catch {
        setViewerRole("home");
      }
    })();
  }, [api, user, authLoading]);

  // ---------------------------------------------------------
  // 2) REDIRECT tradesmen away from homeowner project views
  // ---------------------------------------------------------
  useEffect(() => {
    if (viewerRole !== "trades") return;
    router.replace("/tradesman/projects");
  }, [viewerRole, router]);

  // ---------------------------------------------------------
  // 3) Prevent UI render until:
  //    - project is loaded
  //    - role is known
  // ---------------------------------------------------------
  const ready =
    !vm.loading && !vm.errorStatus && !!vm.project && viewerRole !== "unknown";

  // Project not found or inaccessible
  if (!vm.loading && vm.errorStatus && viewerRole !== "unknown") {
    return (
      <>
        <Head>
          <title>Project not found — VetMyBuilder</title>
          <style>{`body { background: #fafaf9 !important; }`}</style>
        </Head>

        {/* MOBILE — bare 404 (no desktop site chrome bleed-through) */}
        <div className="md:hidden">
          <ProjectErrorMobile />
        </div>

        {/* DESKTOP — unchanged 404 inside Layout */}
        <div className="hidden md:block">
          <Layout>
            <div className="overflow-x-hidden min-h-screen">
              <div className="-mt-14 relative min-h-screen flex items-center justify-center overflow-hidden">
                <div className="relative z-10 w-full max-w-lg px-4 sm:px-0 text-center">
                  <Link href="/" className="inline-flex items-center gap-2.5 mb-10">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500">
                      <Home className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-black text-zinc-900">
                      Vet
                      <span
                        className="text-red-500"
                        style={{
                          fontFamily: "'Caveat', cursive",
                          fontWeight: 700,
                          fontSize: "130%",
                          WebkitTextStroke: "0.5px currentColor",
                        }}
                      >
                        My
                      </span>
                      Builder
                    </span>
                  </Link>
                  <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-10 sm:p-14">
                    <p className="text-8xl font-black text-red-500 leading-none mb-4">
                      404
                    </p>
                    <h1 className="text-2xl font-black tracking-tight text-zinc-900 mb-3">
                      Project not found
                    </h1>
                    <p className="text-zinc-500 text-sm leading-relaxed mb-8">
                      This project doesn&apos;t exist or is no longer available.
                    </p>
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-red-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                    >
                      Back to home
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  if (!ready) {
    return (
      <>
        {/* MOBILE — bare loading (no desktop chrome) */}
        <div className="md:hidden fixed inset-0 bg-white flex items-center justify-center">
          <div
            className="text-[13px] font-semibold text-gray-400"
            data-testid="project-view-loading"
          >
            Loading…
          </div>
        </div>

        {/* DESKTOP — unchanged */}
        <div className="hidden md:block">
          <Layout>
            <div className="-mt-14 relative min-h-screen overflow-hidden">
              <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-8">
                {vm.loadingUi}
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------
  // 4) Owner branch — mobile/desktop split
  // ---------------------------------------------------------
  if (vm.isOwner) {
    const projectIdStr = String(vm.project?.id ?? "");
    const projectTitle = getShortProjectTitle(vm.project?.name);
    return (
      <>
        <Head>
          <title>
            {vm.project?.name
              ? `${vm.project.name} — VetMyBuilder`
              : "Project — VetMyBuilder"}
          </title>
        </Head>

        {/* MOBILE — bare. Live projects show the swipe deck; closed
            projects show a read-only mobile summary (no swiping). */}
        <div className="md:hidden">
          {vm.isClosed && vm.project ? (
            <ClosedProjectMobile
              projectId={projectIdStr}
              project={vm.project as any}
              isCompleted={vm.isCompleted}
            />
          ) : (
            <ProjectSwipeMobile
              projectId={projectIdStr}
              projectTitle={projectTitle}
            />
          )}
        </div>

        {/* DESKTOP — unchanged: existing OwnerProjectView with site chrome */}
        <div className="hidden md:block">
          <Layout>
            <div className="-mt-14 relative min-h-screen overflow-hidden">
              <div
                className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
                data-testid="project-view-page"
              >
                <OwnerProjectView vm={vm} />
                {vm.closeProjectModal}
                {vm.plansModal}
              </div>
            </div>
          </Layout>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------
  // 5) Tradesman / neighbour branches — wrap in Layout (since
  //    we removed the global Layout wrapper for this path)
  // ---------------------------------------------------------
  let viewContent: React.ReactNode = null;
  if (viewerRole === "home") {
    viewContent = <NeighbourProjectView vm={vm} />;
  } else if (viewerRole === "trades") {
    // Redirect already handled above
    viewContent = <TradesmanProjectView vm={vm} />;
  }

  return (
    <>
      <Head>
        <title>
          {vm.project?.name
            ? `${vm.project.name} — VetMyBuilder`
            : "Project — VetMyBuilder"}
        </title>
      </Head>
      <div className="hidden md:block">
        <Layout>
          <div className="-mt-14 relative min-h-screen overflow-hidden">
            <div
              className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10"
              data-testid="project-view-page"
            >
              {viewContent}
              {vm.closeProjectModal}
              {vm.plansModal}
            </div>
          </div>
        </Layout>
      </div>
      {/* MOBILE — non-owner viewers (tradesman/neighbour branches)
          haven't been mobile-redesigned. Rather than bleed the old
          layout through, redirect to /projects (their own list).
          Desktop continues to show the existing flow. */}
      <div className="md:hidden">
        <NonOwnerMobileRedirect />
      </div>
    </>
  );
}
