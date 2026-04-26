// web/components/project/ProjectsListMobile.tsx
//
// Mobile redesign of /projects (Variant A):
//   1. Top bar — VMB wordmark + burger (placeholder; mobile menu not wired here)
//   2. Hero — "My projects" + tagline
//   3. Safety & verification card (collapsible)
//   4. Status tabs (All / Live / Completed) with counts
//   5. Filter chips (Type / Status / Sort) opening BottomSheetPicker
//   6. Project cards
//   7. FAB "+ Post a Job"
//
// Filter values are passed up to the parent fetch hook via props so the same
// /api/projects endpoint serves both desktop & mobile.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Ban,
  Check,
  ChevronRight,
  FolderOpen,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import BottomSheetPicker, {
  type BottomSheetPickerOption,
} from "@/components/project/BottomSheetPicker";
import { useMobileMenu } from "@/utils/mobileMenu";

type Status = "pending" | "live" | "completed";

export type MobileProject = {
  id: number;
  name: string;
  type?: string | null;
  location?: string | null;
  propertyType?: string | null;
  bedrooms?: number | null;
  status?: Status | null;
  coverPhotoUrl?: string | null;
};

export type MobileTab = "all" | "live" | "completed";

export type ProjectsListMobileProps = {
  /** Current tab (controls which projects are shown). */
  tab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  /** Filter values applied to the API request. */
  chipType: string;
  onChangeType: (value: string) => void;
  chipStatus: string;
  onChangeStatus: (value: string) => void;
  sort: "newest" | "oldest";
  onChangeSort: (value: "newest" | "oldest") => void;

  items: MobileProject[];
  loading: boolean;
  /** Counts shown next to each tab — undefined hides the count. */
  counts?: Partial<Record<MobileTab, number>>;
};

/** ===== Word-mark (matches /matches and /inbox) ===== */
function VmbWordmark() {
  return (
    <span className="text-[17px] font-black tracking-tight text-gray-900">
      Vet
      <span className="text-indigo-600">My</span>
      Builder
    </span>
  );
}

/** ===== Status pill on a project card ===== */
function StatusPill({ status }: { status?: Status | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    live: {
      label: "Live",
      cls: "bg-emerald-500 text-white",
    },
    pending: {
      label: "Draft",
      cls: "bg-gray-700 text-white",
    },
    completed: {
      label: "Completed",
      cls: "bg-indigo-600 text-white",
    },
  };
  const meta = (status && map[status]) || map.pending;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-tight ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

/** ===== Tab chip ===== */
function TabChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 px-3.5 py-1.5 rounded-full font-extrabold text-[12px] transition-colors",
        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600",
      ].join(" ")}
      aria-pressed={active}
    >
      <span>{label}</span>
      {typeof count === "number" && (
        <span className={active ? "ml-1.5 text-white/70" : "ml-1.5 text-gray-400"}>
          · {count}
        </span>
      )}
    </button>
  );
}

/** ===== Filter chip (Type / Status / Sort) ===== */
function FilterChip({
  label,
  active,
  open,
  onClick,
  testId,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={[
        "shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 font-bold text-[12px] border-[1.5px] bg-white",
        open
          ? "border-indigo-500 ring-2 ring-indigo-100 text-indigo-700"
          : active
            ? "border-indigo-300 text-indigo-700"
            : "border-gray-200 text-gray-700",
      ].join(" ")}
      aria-expanded={open}
    >
      <span>{label}</span>
      <span aria-hidden className="text-[10px]">
        ▾
      </span>
    </button>
  );
}

/** ===== Safety card (entry point — opens SafetySheet on tap) ===== */
function SafetyCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section
      aria-label="Safety and verification"
      className="mx-5 mt-4"
      data-testid="projects-mobile-safety-card"
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full p-3.5 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
      >
        <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-slate-900 leading-tight">
            Safety &amp; verification
          </span>
          <span className="block text-[12px] text-slate-500 leading-snug mt-1">
            We combine official checks with community signals to help you hire with confidence.
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
    </section>
  );
}

/** ===== Safety sheet (slides up; numbered checks) ===== */
function SafetySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Safety and verification">
      <div className="text-center px-6 pb-3">
        <h3 className="text-[20px] font-extrabold tracking-tight text-gray-900">
          Safety &amp; verification
        </h3>
        <p className="mt-1.5 mx-2 text-[13px] text-gray-500 leading-snug">
          Three checks behind every match.
        </p>
      </div>

      <div className="px-1">
        <SafetyStep
          n={1}
          title="Verified businesses"
          body="We check tradespeople against official UK business registers and show a verified badge when we confirm a match."
        />
        <SafetyStep
          n={2}
          title="Trust score"
          body="Every tradesperson is scored on real signals: recommendations, completed work, photos, responsiveness - not who pays."
        />
        <SafetyStep
          n={3}
          title="Stay sharp"
          body="Always ask for a written quote, check proof of insurance, and keep all messages and agreements in writing."
        />
      </div>

      <div
        className="px-5 pt-4"
        style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-extrabold text-[15px] tracking-tight shadow-[0_8px_22px_rgba(99,102,241,0.3)]"
        >
          Got it
        </button>
      </div>
    </BottomSheet>
  );
}

function SafetyStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3.5 px-6 py-3">
      <span className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black text-[13px] shrink-0">
        {n}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-extrabold tracking-tight text-gray-900">
          {title}
        </div>
        <div className="text-[12px] text-gray-600 leading-snug mt-1">
          {body}
        </div>
      </div>
    </div>
  );
}

/** ===== Project card ===== */
function ProjectCard({
  project,
  onOpen,
}: {
  project: MobileProject;
  onOpen: () => void;
}) {
  const fallbackImg =
    "https://cdn.home-designing.com/wp-content/uploads/2024/08/Graceful-Mid-Century-Modern-Living-Rooms.jpg";

  const meta = [
    project.location || null,
    project.propertyType
      ? [project.propertyType, project.bedrooms ? `${project.bedrooms} bed` : null]
          .filter(Boolean)
          .join(" · ")
      : null,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left bg-white border border-gray-200 rounded-[18px] overflow-hidden active:scale-[0.99] transition-transform"
      data-testid={`mobile-project-card-${project.id}`}
    >
      <div
        className="relative aspect-[16/9] bg-cover bg-center bg-gray-100"
        style={{
          backgroundImage: `url(${project.coverPhotoUrl || fallbackImg})`,
        }}
      >
        <div className="absolute top-2.5 right-2.5">
          <StatusPill status={project.status ?? undefined} />
        </div>
      </div>

      <div className="p-3.5">
        <h3 className="text-[16px] font-extrabold tracking-tight text-gray-900 leading-tight">
          {project.name}
        </h3>
        {meta.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {meta.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold"
              >
                {m}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[12px] text-gray-500 font-semibold">
            {project.type || "Project"}
          </span>
          <span className="text-[12px] text-indigo-600 font-extrabold">
            View →
          </span>
        </div>
      </div>
    </button>
  );
}

/** ===== Empty state ===== */
function EmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <div className="px-5 pt-10 pb-10 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
        <FolderOpen className="h-6 w-6 text-gray-400" />
      </div>
      <p className="text-[14px] font-extrabold text-gray-900">
        No projects match these filters
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 inline-flex items-center px-3.5 py-1.5 rounded-full bg-gray-900 text-white font-extrabold text-[12px]"
      >
        Clear filters
      </button>
    </div>
  );
}

/** ===== Card skeleton ===== */
function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-[18px] overflow-hidden animate-pulse">
      <div className="aspect-[16/9] bg-gray-200" />
      <div className="p-3.5">
        <div className="h-4 w-2/3 bg-gray-200 rounded mb-2" />
        <div className="h-3 w-1/2 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

/** ===== Main mobile list ===== */
export default function ProjectsListMobile({
  tab,
  onChangeTab,
  chipType,
  onChangeType,
  chipStatus,
  onChangeStatus,
  sort,
  onChangeSort,
  items,
  loading,
  counts,
}: ProjectsListMobileProps) {
  const router = useRouter();
  const { openMenu } = useMobileMenu();

  const [safetyOpen, setSafetyOpen] = useState(false);
  const [openSheet, setOpenSheet] = useState<null | "type" | "sort">(null);

  // ===== Type options =====
  // Compute distinct types from current items so the picker only shows
  // categories that exist for this user. Same approach as desktop filter.
  const typeOptions: BottomSheetPickerOption[] = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const t = (it.type || "").toString().trim();
      if (t) set.add(t);
    }
    const sorted = Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    return [
      { value: "", label: "All types" },
      ...sorted.map((t) => ({ value: t, label: t })),
    ];
  }, [items]);

  // ===== Sort options =====
  const sortOptions: BottomSheetPickerOption[] = [
    { value: "newest", label: "Newest first" },
    { value: "oldest", label: "Oldest first" },
  ];

  // ===== Picker config =====
  const sheetConfig = useMemo(() => {
    if (openSheet === "type") {
      return {
        title: "Filter by type",
        subtitle: "Show only projects of a certain trade.",
        options: typeOptions,
        selected: chipType,
        onSelect: onChangeType,
      };
    }
    if (openSheet === "sort") {
      return {
        title: "Sort projects",
        subtitle: undefined,
        options: sortOptions,
        selected: sort,
        onSelect: (v: string) =>
          onChangeSort(v === "oldest" ? "oldest" : "newest"),
      };
    }
    return null;
  }, [
    openSheet,
    typeOptions,
    sortOptions,
    chipType,
    sort,
    onChangeType,
    onChangeSort,
  ]);

  // Reset filters helper
  function clearFilters() {
    onChangeType("");
    onChangeStatus("");
    onChangeTab("all");
  }

  // Block native body scroll only when the safety card hasn't been used; we
  // don't want sticky scroll behaviour. Just provide the right paddings.
  useEffect(() => {
    // No-op; left for future use.
  }, []);

  const sheetTitle = sheetConfig?.title ?? "";
  const sheetSubtitle = sheetConfig?.subtitle;
  const sheetOptions = sheetConfig?.options ?? [];
  const sheetSelected = sheetConfig?.selected ?? "";
  const sheetOnSelect = sheetConfig?.onSelect ?? (() => {});

  return (
    <main
      className="min-h-screen bg-white"
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
      }}
      data-testid="projects-mobile"
    >
      <div className="h-[env(safe-area-inset-top)]" />

      {/* Top bar */}
      <div className="px-5 pt-2 pb-1 flex items-center justify-between">
        <VmbWordmark />
        <button
          type="button"
          aria-label="Open menu"
          onClick={openMenu}
          className="w-[38px] h-[38px] rounded-full bg-gray-100 flex items-center justify-center text-gray-700"
          data-testid="projects-mobile-burger"
        >
          <span aria-hidden className="text-[18px] leading-none">
            ≡
          </span>
        </button>
      </div>

      {/* Hero */}
      <div className="px-5 pt-1 pb-2">
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-gray-900 leading-tight">
          My projects
        </h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          Your live and draft jobs in one place.
        </p>
      </div>

      {/* Safety card */}
      <SafetyCard onOpen={() => setSafetyOpen(true)} />
      <SafetySheet open={safetyOpen} onClose={() => setSafetyOpen(false)} />

      {/* Tabs */}
      <div
        className="px-5 pt-3.5 pb-1 flex gap-2 overflow-x-auto no-scrollbar"
        data-testid="projects-mobile-tabs"
      >
        <TabChip
          label="All"
          count={counts?.all}
          active={tab === "all"}
          onClick={() => onChangeTab("all")}
        />
        <TabChip
          label="Live"
          count={counts?.live}
          active={tab === "live"}
          onClick={() => onChangeTab("live")}
        />
        <TabChip
          label="Completed"
          count={counts?.completed}
          active={tab === "completed"}
          onClick={() => onChangeTab("completed")}
        />
      </div>

      {/* Filter chips */}
      <div
        className="px-5 pt-2 flex gap-2 overflow-x-auto no-scrollbar"
        data-testid="projects-mobile-filter-chips"
      >
        <FilterChip
          label={chipType ? `Type: ${chipType}` : "Type"}
          active={!!chipType}
          open={openSheet === "type"}
          onClick={() => setOpenSheet("type")}
          testId="chip-type"
        />
        <FilterChip
          label={sort === "oldest" ? "Oldest first" : "Newest first"}
          active={sort !== "newest"}
          open={openSheet === "sort"}
          onClick={() => setOpenSheet("sort")}
          testId="chip-sort"
        />
      </div>

      {/* List */}
      <div
        className="flex flex-col gap-3 px-5 pt-3 pb-32"
        data-testid="projects-mobile-list"
      >
        {loading && items.length === 0 ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : items.length === 0 ? (
          <EmptyFiltered onClear={clearFilters} />
        ) : (
          items.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onOpen={() => router.push(`/projects/${p.id}`)}
            />
          ))
        )}
      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={() => router.push("/projects/new")}
        className="fixed right-4 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-white font-extrabold text-[14px]"
        style={{
          bottom: "max(20px, env(safe-area-inset-bottom))",
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          boxShadow: "0 12px 28px rgba(79, 70, 229, 0.35)",
        }}
        data-testid="projects-mobile-fab"
      >
        <Plus className="h-4 w-4" />
        Post a Job
      </button>

      {/* Close-success toast (driven by ?closed=&name= query) */}
      <CloseSuccessToast />

      {/* Filter bottom sheet picker (single instance, reused) */}
      <BottomSheetPicker
        open={openSheet !== null}
        onClose={() => setOpenSheet(null)}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        options={sheetOptions}
        selected={sheetSelected}
        onSelect={sheetOnSelect}
        clearable={openSheet !== "sort"}
        testId="projects-mobile-picker"
      />
    </main>
  );
}

/* ===================================================================== */
/* Close-success toast                                                   */
/* ===================================================================== */
/**
 * Reads `?closed=completed|archived` and `?name=<projectName>` set by the
 * close-project page on success. Shows a bottom toast for 4s, mirroring the
 * desktop flash messages from useProjectView.tsx (completed vs archived).
 * Auto-clears the query string on dismiss so a refresh doesn't re-trigger.
 */
function CloseSuccessToast() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [closedKind, setClosedKind] = useState<"completed" | "archived" | null>(
    null,
  );
  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    if (!router.isReady) return;
    const raw = router.query.closed;
    const closed = Array.isArray(raw) ? raw[0] : raw;
    if (closed !== "completed" && closed !== "archived") return;
    const nameRaw = router.query.name;
    const name = Array.isArray(nameRaw) ? nameRaw[0] : nameRaw;
    setClosedKind(closed);
    setProjectName(typeof name === "string" ? name : "");
    setVisible(true);
  }, [router.isReady, router.query.closed, router.query.name]);

  // Auto-dismiss after 4s, and strip the query so refresh doesn't re-show it.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => dismiss(), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    setVisible(false);
    if (router.query.closed || router.query.name) {
      const next = { ...router.query };
      delete (next as any).closed;
      delete (next as any).name;
      router.replace({ pathname: router.pathname, query: next }, undefined, {
        shallow: true,
      });
    }
  }

  if (!visible || !closedKind) return null;

  const isCompleted = closedKind === "completed";
  const headline = isCompleted
    ? "Project closed (Completed - Community)"
    : "Project closed and archived";
  const detail = isCompleted
    ? `${projectName || "This project"} is now in your Completed tab.`
    : `${projectName || "This project"} won't appear in your live list.`;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="close-success-toast"
      className="fixed left-4 right-4 z-50 flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 border border-gray-200"
      style={{
        bottom: "max(80px, env(safe-area-inset-bottom))",
        boxShadow: "0 14px 36px rgba(15,23,42,0.18)",
      }}
    >
      <span
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isCompleted
            ? "bg-emerald-50 text-emerald-700"
            : "bg-gray-100 text-gray-600"
        }`}
      >
        {isCompleted ? (
          <Check className="w-5 h-5" />
        ) : (
          <Ban className="w-4 h-4" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-extrabold tracking-tight text-gray-900 truncate">
          {headline}
        </div>
        <div className="text-[11px] text-gray-500 leading-snug">{detail}</div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-gray-400 shrink-0 p-1 -mr-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
