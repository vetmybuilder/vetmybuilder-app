import * as React from "react";
import { useApi } from "@/utils/api";
import ShareProfileModal from "@/components/fileUpload/ShareProfileModal";
import PlansModal from "@/components/plans/PlansModal";
import AccordionRow from "@/components/AccordionRow";
import HireRequestCard, {
  type HireRequest,
} from "@/components/tradesmen/HireRequestCard";
import type { PlanId } from "@/shared/lib/plans";
import { useRouter } from "next/router";
import {
  Briefcase,
  CheckCircle2,
  Wrench,
  MapPin,
  Home,
  BedDouble,
  Calendar,
  User,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react";

/** Shape from tradesman/projects list */
export type ListProject = {
  id: number;
  name: string;
  type: string;
  location: string;
  createdAt: string;
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  status?: "pending" | "live" | "archived" | "completed";
  ownerUserId?: string;
};

/** Full project payload from /api/projects/:id */
type FullProject = {
  id: number;
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  ownerUserId: string;
  status: "pending" | "live" | "archived" | "completed";
};

type Flash =
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

type Contact = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

type ContactStatus =
  | "unknown"
  | "not_unlocked"
  | "pending_admin_review"
  | "loaded"
  | "error"
  | "verification_required"
  | "verification_pending"
  | "verification_rejected"
  | "payment_required"
  | "unlock_rejected";

type Props = {
  project: ListProject;
  expanded: boolean;
  onToggle: () => void;
};

export default function TradesmanProjectAccordionRow({
  project,
  expanded,
  onToggle,
}: Props) {
  const api = useApi();
  const router = useRouter();

  const [fullProject, setFullProject] = React.useState<FullProject | null>(null);
  const [classification, setClassification] = React.useState<any>(null);
  const [projLoading, setProjLoading] = React.useState(false);
  const [projErr, setProjErr] = React.useState<string | null>(null);

  const [shareChecking, setShareChecking] = React.useState(false);
  const [hasShared, setHasShared] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareBusy, setShareBusy] = React.useState(false);
  const [shareFlash, setShareFlash] = React.useState<Flash | null>(null);

  const [ownerContact, setOwnerContact] = React.useState<Contact | null>(null);
  const [contactLoading, setContactLoading] = React.useState(false);
  const [contactStatus, setContactStatus] = React.useState<ContactStatus>("unknown");
  const hasRequestedContactRef = React.useRef(false);

  const [plansOpen, setPlansOpen] = React.useState(false);
  const [currentPlanId, setCurrentPlanId] = React.useState<PlanId | undefined>("free");

  const [projectHires, setProjectHires] = React.useState<HireRequest[]>([]);
  const [hiresLoading, setHiresLoading] = React.useState(false);

  const fetchProjectHires = React.useCallback(async () => {
    setHiresLoading(true);
    try {
      const { data } = await api.get("/api/tradesmen/me/hires");
      const all: HireRequest[] = Array.isArray(data?.items) ? data.items : [];
      setProjectHires(all.filter((h) => h.projectId === project.id));
    } catch {
      setProjectHires([]);
    } finally {
      setHiresLoading(false);
    }
  }, [api, project.id]);

  React.useEffect(() => {
    if (!expanded) return;
    fetchProjectHires();
  }, [expanded, fetchProjectHires]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        if (cancelled) return;
        const livePlan =
          (data?.profile?.plan as PlanId | undefined) ||
          (data?.profile?.planId as PlanId | undefined) ||
          "free";
        setCurrentPlanId(livePlan);
      } catch {
        if (!cancelled) setCurrentPlanId("free");
      }
    })();
    return () => { cancelled = true; };
  }, [api]);

  React.useEffect(() => {
    if (!expanded) return;
    if (fullProject) return;
    let cancelled = false;
    setProjLoading(true);
    setProjErr(null);
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${project.id}`);
        if (cancelled) return;
        setFullProject(data?.project ?? null);
        setClassification(data?.classification ?? null);
      } catch (e: any) {
        if (cancelled) return;
        setProjErr(e?.response?.data?.error || e?.message || "Failed to load project details");
        setFullProject(null);
      } finally {
        if (!cancelled) setProjLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, project.id, api, fullProject]);

  React.useEffect(() => {
    if (!expanded) return;
    if (hasShared) { setShareChecking(false); return; }
    let cancelled = false;
    setShareChecking(true);
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/interest", { params: { projectId: project.id } });
        if (cancelled) return;
        const already = !!data && (data.shared === true || data.alreadyShared === true || Number.isFinite(Number(data.recommendationId)));
        setHasShared(already);
      } catch {
        if (!cancelled) setHasShared(false);
      } finally {
        if (!cancelled) setShareChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, project.id, api, hasShared]);

  React.useEffect(() => {
    if (!expanded) return;
    if (hasRequestedContactRef.current) { setContactLoading(false); return; }
    let cancelled = false;
    hasRequestedContactRef.current = true;
    setContactLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${project.id}/owner-contact`);
        if (cancelled) return;
        const ok = Boolean(data?.ok);
        const unlocked = Boolean(data?.unlocked);
        const email = data?.email || data?.owner?.email || null;
        if (ok && unlocked && email) {
          setOwnerContact({
            firstName: data.firstName ?? data?.owner?.firstName ?? null,
            lastName: data.lastName ?? data?.owner?.lastName ?? null,
            email,
          });
          setContactStatus("loaded");
        } else {
          setOwnerContact(null);
          const state = String(data?.state || "").toLowerCase();
          const error = String(data?.error || "").toLowerCase();
          let nextStatus: ContactStatus = "not_unlocked";
          if (["verification_required", "verification_pending", "verification_rejected", "pending_admin_review", "payment_required", "unlock_rejected"].includes(state)) {
            nextStatus = state as ContactStatus;
          } else if (["verification_required", "verification_pending", "verification_rejected", "payment_required", "pending_admin_review", "unlock_rejected"].includes(error)) {
            nextStatus = error as ContactStatus;
          }
          setContactStatus(nextStatus);
        }
      } catch {
        if (cancelled) return;
        setOwnerContact(null);
        setContactStatus("error");
      } finally {
        if (!cancelled) setContactLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, project.id, api]);

  const handleShareSubmit = async (files: File[]) => {
    setShareFlash(null);
    setShareBusy(true);
    try {
      const fd = new FormData();
      const pid = String(project.id);
      fd.append("projectId", pid);
      fd.append("pid", pid);
      (files || []).forEach((f) => fd.append("photos", f));
      await api.post("/api/tradesmen/shares", fd);
      setShareOpen(false);
      setHasShared(true);
      setShareFlash({ kind: "success", text: "Profile shared. We've notified the homeowner." });
      window.setTimeout(() => setShareFlash(null), 5000);
    } catch (e: any) {
      setShareFlash({ kind: "error", text: e?.response?.data?.error || e?.message || "Failed to share profile. Please try again." });
      window.setTimeout(() => setShareFlash(null), 6000);
    } finally {
      setShareBusy(false);
    }
  };

  const handleUpgradeClick = () => {
    if (["verification_required", "verification_rejected", "verification_pending"].includes(contactStatus)) {
      router.push("/tradesman/profile");
      return;
    }
    setPlansOpen(true);
  };

  const ep = (fullProject || project) as FullProject | ListProject;
  const propType = (ep as any).propertyType || (project.propertyType ?? "—");
  const bedrooms = (ep as any).bedrooms ?? (typeof project.bedrooms === "number" ? project.bedrooms : "—");
  const status = (ep as any).status || (project.status ?? "live");
  const descriptionRaw = "description" in ep && (ep as any).description && String((ep as any).description).trim().length > 0
    ? (ep as any).description
    : "No description provided.";

  const contactName = [ownerContact?.firstName, ownerContact?.lastName].filter(Boolean).join(" ") || "—";

  return (
    <AccordionRow
      expanded={expanded}
      onToggle={onToggle}
      testId="project-row"
      header={
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <span className="text-sm sm:text-base font-semibold text-white">
            {project.name}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/90">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium">
              {project.type}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium">
              {project.location}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-medium">
              Created: {new Date(project.createdAt).toLocaleDateString("en-GB")}
            </span>
          </div>
        </div>
      }
    >
      {/* Hire requests */}
      {!hiresLoading && projectHires.length > 0 && (
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-4" data-testid="inline-hire-requests">
          <div className="mb-3 flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold text-zinc-900">
              {projectHires.length === 1 ? "Hire request for this project" : `${projectHires.length} hire requests for this project`}
            </h3>
          </div>
          <div className="space-y-3">
            {projectHires.map((h) => (
              <HireRequestCard key={h.id} hire={h} onResponded={fetchProjectHires} />
            ))}
          </div>
        </div>
      )}

      {/* Share flash */}
      {shareFlash && (
        <div className={`rounded-lg px-4 py-3 text-sm ${shareFlash.kind === "success" ? "bg-[#2d9d78]/10 text-[#2d9d78]" : "bg-red-50 text-red-700"}`} data-testid="share-flash-inline">
          {shareFlash.text}
        </div>
      )}

      {/* Shared banner */}
      {!shareFlash && hasShared && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#2d9d78]/10 text-[#2d9d78]" data-testid="share-already-banner-inline">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Your profile has already been shared.</span>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Project details — 2 columns */}
        <div className="lg:col-span-2">
          {projLoading ? (
            <div className="rounded-xl border border-[#e8e0da] bg-[#f5f0ed] p-5 space-y-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            </div>
          ) : projErr ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm text-red-700">{projErr}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#e8e0da] bg-[#f5f0ed] p-5 space-y-5">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Project details</h4>
                <p className="text-sm text-slate-500">Summary of this homeowner&apos;s job.</p>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#2d9d78]/10 text-[#2d9d78]">
                  <Wrench className="h-3 w-3" />
                  {ep.type}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-200/60 text-slate-600">
                  <MapPin className="h-3 w-3" />
                  {ep.location}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#c75a45]/10 text-[#c75a45]">
                  <Home className="h-3 w-3" />
                  {propType}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-200/60 text-slate-600">
                  <BedDouble className="h-3 w-3" />
                  {bedrooms} bed
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
                </span>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#2d9d78]">
                    <Wrench className="h-3 w-3" /> Type
                  </div>
                  <p className="text-sm font-medium text-slate-900">{ep.type}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <MapPin className="h-3 w-3" /> Location
                  </div>
                  <p className="text-sm font-medium text-slate-900">{ep.location}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#c75a45]">
                    <Home className="h-3 w-3" /> Property
                  </div>
                  <p className="text-sm font-medium text-slate-900">{propType}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <BedDouble className="h-3 w-3" /> Bedrooms
                  </div>
                  <p className="text-sm font-medium text-slate-900">{bedrooms}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Calendar className="h-3 w-3" /> Created
                  </div>
                  <p className="text-sm font-medium text-slate-900">{new Date(ep.createdAt).toLocaleString("en-GB")}</p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="pt-4 border-t border-[#e8e0da]">
                <h5 className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Description</h5>
                <p className="text-sm text-slate-800 leading-relaxed">{descriptionRaw}</p>
              </div>

              {/* Express interest button */}
              {!hasShared && !shareFlash && (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  disabled={shareBusy || shareChecking}
                  className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-red-500/30 hover:bg-red-600 disabled:opacity-60"
                  data-testid="btn-express-interest-inline"
                >
                  {shareBusy || shareChecking ? "Sending…" : "Express interest"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Contact card */}
        <div className="rounded-xl bg-[#c75a45] text-white p-5 space-y-4">
          <div>
            <h4 className="font-semibold text-lg">Homeowner contact</h4>
            <p className="text-sm opacity-80">
              {contactStatus === "loaded" ? "Contact unlocked" : contactLoading ? "Loading..." : "Contact locked"}
            </p>
          </div>

          {contactStatus === "loaded" && ownerContact ? (
            <>
              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/10">
                  <User className="h-5 w-5 mt-0.5 opacity-70" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-70">Name</p>
                    <p className="font-medium">{contactName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/10">
                  <Mail className="h-5 w-5 mt-0.5 opacity-70" />
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide opacity-70">Email</p>
                    <a href={`mailto:${ownerContact.email}`} className="font-medium hover:underline">
                      {ownerContact.email}
                    </a>
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/20 text-green-100">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">Use this contact respectfully and only for this project.</p>
              </div>
            </>
          ) : (
            <div className="pt-2 space-y-3">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-white/10">
                <Shield className="h-5 w-5 mt-0.5 opacity-70" />
                <div>
                  <p className="font-medium text-sm">Contact details locked</p>
                  <p className="text-xs opacity-70 mt-1">Complete verification and choose an unlock option to see this homeowner&apos;s email.</p>
                </div>
              </div>
              <button
                onClick={handleUpgradeClick}
                className="w-full rounded-lg bg-white/20 hover:bg-white/30 px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                View plans &amp; unlock contact
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Project Insights */}
      {classification && (
        <div className="rounded-xl border border-[#e8e0da] bg-[#f5f0ed] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            <h4 className="font-semibold text-slate-900">Project Insights</h4>
          </div>

          <div className="flex flex-wrap gap-2">
            {classification.type && (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#2d9d78]/10 text-[#2d9d78]">
                {classification.type}
              </span>
            )}
            {classification.complexity && (
              <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {classification.complexity.charAt(0).toUpperCase() + classification.complexity.slice(1)}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {classification.recommended_trades?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">Trades</p>
                <p className="text-sm text-slate-800">{classification.recommended_trades.join(", ")}</p>
              </div>
            )}
            {classification.summary && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">Summary</p>
                <p className="text-sm text-slate-800 italic leading-relaxed">{classification.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share modal */}
      {shareOpen && !hasShared && (
        <ShareProfileModal open={shareOpen} onClose={() => setShareOpen(false)} onSubmit={handleShareSubmit} />
      )}

      {/* Plans modal */}
      <PlansModal isOpen={plansOpen} onClose={() => setPlansOpen(false)} currentPlanId={currentPlanId} projectId={project.id} />
    </AccordionRow>
  );
}
