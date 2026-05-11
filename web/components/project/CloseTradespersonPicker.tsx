// web/components/project/CloseTradespersonPicker.tsx
//
// Mobile bottom-sheet picker used by the /projects/[id]/close page.
// Mirrors the desktop CloseProjectModal data sources so the picker shows the
// same candidates: recommendations (via /api/recommendations/ratings) plus
// tradespeople who shared their profile to this project (/api/tradesmen/shares).

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Plus, Search, Star, Share2, Heart, Check } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { useApi } from "@/utils/api";

export type PickedTradesperson =
  | { kind: "rec"; id: number; label: string; fromCommunity?: boolean }
  | { kind: "share"; uid: string; label: string }
  | { kind: "match"; uid: string; label: string }
  | { kind: "someone-else" };

type Candidate = {
  key: string;
  groupKey: "rec" | "share" | "match";
  label: string;
  trades?: string | null;
  yearsTrading?: number | null;
  avatarColor: AvatarColor;
  initials: string;
  fromFriend?: boolean;
  verified?: boolean;
  fromCommunity?: boolean;
  recId?: number;
  uid?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: number;
  /** Current selection so we can highlight the active row when re-opened. */
  value?: PickedTradesperson | null;
  onPick: (picked: PickedTradesperson) => void;
};

type AvatarColor = "green" | "amber" | "rose" | "indigo" | "teal" | "pink" | "sky";

const AVATAR_GRADIENTS: Record<AvatarColor, string> = {
  green: "linear-gradient(135deg, #6ee7b7, #10b981)",
  amber: "linear-gradient(135deg, #fcd34d, #f59e0b)",
  rose: "linear-gradient(135deg, #fda4af, #f43f5e)",
  indigo: "linear-gradient(135deg, #a5b4fc, #6366f1)",
  teal: "linear-gradient(135deg, #5eead4, #0d9488)",
  pink: "linear-gradient(135deg, #f9a8d4, #db2777)",
  sky: "linear-gradient(135deg, #7dd3fc, #0284c7)",
};

const PALETTE: AvatarColor[] = [
  "green",
  "indigo",
  "amber",
  "rose",
  "teal",
  "pink",
  "sky",
];

function colorFor(seed: string): AvatarColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initialsOf(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(q, i);
    if (at < 0) {
      out.push(text.slice(i));
      break;
    }
    if (at > i) out.push(text.slice(i, at));
    out.push(
      <mark key={at} className="bg-amber-100 text-current font-extrabold">
        {text.slice(at, at + q.length)}
      </mark>,
    );
    i = at + q.length;
  }
  return <>{out}</>;
}

export default function CloseTradespersonPicker({
  open,
  onClose,
  projectId,
  value,
  onPick,
}: Props) {
  const api = useApi();

  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<PickedTradesperson | null>(null);
  const cancelRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setOpenGroups({});
      setPending(value ?? null);
    }
  }, [open, value]);

  // Load candidates whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    cancelRef.current = false;
    setLoading(true);

    (async () => {
      const merged: Candidate[] = [];

      try {
        const { data } = await api.get("/api/recommendations/ratings", {
          params: { projectId, limit: 50, offset: 0 },
        });
        const items: any[] = Array.isArray(data?.items) ? data.items : [];

        const seen = new Map<string, any>();
        for (const r of items) {
          const ckey = r.chCompanyNumber
            ? `ch:${r.chCompanyNumber}`
            : `name:${(r.chCompanyName || r.company || "").trim().toLowerCase()}`;
          const cur = seen.get(ckey);
          if (!cur || (r.score ?? 0) > (cur.score ?? 0)) seen.set(ckey, r);
        }

        for (const r of seen.values()) {
          const display =
            (r.chCompanyName &&
              (r.chStatus === "verified" || r.chStatus === "ambiguous"))
              ? r.chCompanyName
              : r.company || r.name || "Unknown tradesperson";
          const seedSrc = String(r.id ?? display);
          merged.push({
            key: `rec:${r.id}`,
            groupKey: "rec",
            label: display,
            trades: r.trades || r.specialism || null,
            yearsTrading: typeof r.yearsTrading === "number" ? r.yearsTrading : null,
            avatarColor: colorFor(seedSrc),
            initials: initialsOf(display),
            fromFriend: String(r.source || "").toLowerCase() === "friend",
            verified: r.chStatus === "verified",
            fromCommunity:
              r.fromCommunity === 1 ||
              r.fromCommunity === true ||
              String(r.source || "").toLowerCase() === "community",
            recId: Number(r.id),
          });
        }
      } catch {
        // ignore — shares may still load
      }

      try {
        const { data } = await api.get("/api/tradesmen/shares", {
          params: { projectId, limit: 50 },
        });
        const shares: any[] = Array.isArray(data?.shares) ? data.shares : [];

        for (const s of shares) {
          const uid = s.tradesmanUid || s.tradesman_uid || s.tradesman_user_id;
          if (!uid) continue;
          const display =
            s.companyName ||
            s.company_name ||
            s.tradesmanCompany ||
            s.tradesmanName ||
            s.tradesman_name ||
            "Unknown tradesperson";
          merged.push({
            key: `share:${uid}`,
            groupKey: "share",
            label: display,
            trades: s.trades || s.specialism || null,
            yearsTrading: typeof s.yearsTrading === "number" ? s.yearsTrading : null,
            avatarColor: colorFor(String(uid)),
            initials: initialsOf(display),
            uid: String(uid),
          });
        }
      } catch {
        // shares are optional
      }

      try {
        const { data } = await api.get(
          `/api/projects/${projectId}/matched-tradespeople`,
        );
        const matches: any[] = Array.isArray(data?.matches) ? data.matches : [];
        for (const m of matches) {
          const uid = m.tradesmanUid;
          if (!uid) continue;
          const display =
            m.companyName || m.tradesmanName || "Unknown tradesperson";
          merged.push({
            key: `match:${uid}`,
            groupKey: "match",
            label: display,
            avatarColor: colorFor(String(uid)),
            initials: initialsOf(display),
            uid: String(uid),
          });
        }
      } catch {
        // matches are optional
      }

      // De-dupe by uid first, then key
      const dedup = new Map<string, Candidate>();
      for (const c of merged) {
        const k = c.uid ? `uid:${c.uid}` : c.key;
        if (!dedup.has(k)) dedup.set(k, c);
      }

      if (!cancelRef.current) {
        setCandidates(Array.from(dedup.values()));
        setLoading(false);
      }
    })();

    return () => {
      cancelRef.current = true;
    };
  }, [open, projectId, api]);

  const recList = useMemo(
    () => candidates.filter((c) => c.groupKey === "rec"),
    [candidates],
  );
  const shareList = useMemo(
    () => candidates.filter((c) => c.groupKey === "share"),
    [candidates],
  );
  const matchList = useMemo(
    () => candidates.filter((c) => c.groupKey === "match"),
    [candidates],
  );

  const recMatches = useMemo(
    () => filterByQuery(recList, query),
    [recList, query],
  );
  const shareMatches = useMemo(
    () => filterByQuery(shareList, query),
    [shareList, query],
  );
  const matchMatches = useMemo(
    () => filterByQuery(matchList, query),
    [matchList, query],
  );

  // Auto-expand groups that have matches when the user is searching.
  const isSearching = query.trim().length > 0;
  const recOpen = isSearching ? recMatches.length > 0 : !!openGroups.rec;
  const shareOpen = isSearching ? shareMatches.length > 0 : !!openGroups.share;
  const matchOpen = isSearching ? matchMatches.length > 0 : !!openGroups.match;

  const totalMatches =
    recMatches.length + shareMatches.length + matchMatches.length;

  function toggleGroup(k: "rec" | "share" | "match") {
    setOpenGroups((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  function pickCandidate(c: Candidate) {
    if (c.groupKey === "rec" && typeof c.recId === "number") {
      setPending({
        kind: "rec",
        id: c.recId,
        label: c.label,
        fromCommunity: c.fromCommunity,
      });
    } else if (c.groupKey === "share" && c.uid) {
      setPending({ kind: "share", uid: c.uid, label: c.label });
    } else if (c.groupKey === "match" && c.uid) {
      setPending({ kind: "match", uid: c.uid, label: c.label });
    }
  }

  function pickSomeoneElse() {
    setPending({ kind: "someone-else" });
  }

  function commit() {
    if (!pending) return;
    onPick(pending);
    onClose();
  }

  const isPending = (c: Candidate): boolean => {
    if (!pending) return false;
    if (pending.kind === "rec" && c.groupKey === "rec")
      return pending.id === c.recId;
    if (pending.kind === "share" && c.groupKey === "share")
      return pending.uid === c.uid;
    if (pending.kind === "match" && c.groupKey === "match")
      return pending.uid === c.uid;
    return false;
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      ariaLabel="Pick a tradesperson"
      sheetTestId="close-picker-sheet"
    >
      <div className="px-5 pb-2">
        <h3 className="text-[17px] font-extrabold tracking-tight text-gray-900">
          Who did the work?
        </h3>
        <p className="mt-1 text-[11.5px] text-gray-500 leading-snug">
          {isSearching
            ? `${totalMatches} ${totalMatches === 1 ? "match" : "matches"} for "${query.trim()}"`
            : "Pick from your recommendations or shared profiles."}
        </p>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-gray-100 rounded-xl text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            data-testid="close-picker-search"
          />
        </div>
      </div>

      <div className="overflow-y-auto px-4" style={{ maxHeight: "55vh" }}>
        {loading ? (
          <div className="py-10 text-center text-[12.5px] text-gray-500">
            Loading tradespeople…
          </div>
        ) : (
          <>
            <AccordionGroup
              tone="rec"
              icon={<Star className="w-3.5 h-3.5" />}
              label="Your recommendations"
              total={recList.length}
              shown={recMatches.length}
              isSearching={isSearching}
              open={recOpen}
              onToggle={() => toggleGroup("rec")}
              candidates={recMatches}
              query={query}
              isPending={isPending}
              onPick={pickCandidate}
            />

            <AccordionGroup
              tone="share"
              icon={<Share2 className="w-3.5 h-3.5" />}
              label="Shared their profile"
              total={shareList.length}
              shown={shareMatches.length}
              isSearching={isSearching}
              open={shareOpen}
              onToggle={() => toggleGroup("share")}
              candidates={shareMatches}
              query={query}
              isPending={isPending}
              onPick={pickCandidate}
            />

            <AccordionGroup
              tone="match"
              icon={<Heart className="w-3.5 h-3.5" />}
              label="Matched on VetMyBuilder"
              total={matchList.length}
              shown={matchMatches.length}
              isSearching={isSearching}
              open={matchOpen}
              onToggle={() => toggleGroup("match")}
              candidates={matchMatches}
              query={query}
              isPending={isPending}
              onPick={pickCandidate}
            />

            <button
              type="button"
              onClick={pickSomeoneElse}
              data-testid="close-picker-someone-else"
              className={`w-full mt-1 flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-[1.5px] border-dashed text-left ${
                pending?.kind === "someone-else"
                  ? "bg-indigo-100 border-indigo-300"
                  : "bg-indigo-50/50 border-indigo-200"
              }`}
            >
              <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-extrabold text-indigo-900">
                  Someone else
                </span>
                <span className="block text-[10.5px] text-gray-500 font-semibold">
                  Tradesperson not on this list
                </span>
              </span>
              {pending?.kind === "someone-else" ? (
                <Check className="w-4 h-4 text-indigo-700" />
              ) : (
                <ChevronRight className="w-4 h-4 text-indigo-700" />
              )}
            </button>
          </>
        )}
      </div>

      <div
        className="px-4 pt-3 border-t border-gray-100"
        style={{ paddingBottom: "max(18px, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={commit}
          disabled={!pending}
          data-testid="close-picker-done"
          className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-extrabold text-[14px] shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none"
        >
          Done
        </button>
      </div>
    </BottomSheet>
  );
}

function filterByQuery(list: Candidate[], q: string): Candidate[] {
  if (!q.trim()) return list;
  const needle = q.trim().toLowerCase();
  return list.filter((c) => {
    const hay = `${c.label} ${c.trades ?? ""}`.toLowerCase();
    return hay.includes(needle);
  });
}

function AccordionGroup({
  tone,
  icon,
  label,
  total,
  shown,
  isSearching,
  open,
  onToggle,
  candidates,
  query,
  isPending,
  onPick,
}: {
  tone: "rec" | "share" | "match";
  icon: React.ReactNode;
  label: string;
  total: number;
  shown: number;
  isSearching: boolean;
  open: boolean;
  onToggle: () => void;
  candidates: Candidate[];
  query: string;
  isPending: (c: Candidate) => boolean;
  onPick: (c: Candidate) => void;
}) {
  if (total === 0 && !isSearching) {
    return null;
  }
  if (isSearching && shown === 0) {
    return null;
  }

  const headerToneClasses =
    tone === "rec"
      ? "bg-indigo-50 text-indigo-700"
      : tone === "share"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-700";

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        data-testid={`close-picker-group-${tone}`}
        className={`w-full flex items-center gap-2.5 px-3.5 py-3 bg-white border-[1.5px] border-gray-200 ${
          open ? "rounded-t-2xl border-b-gray-100" : "rounded-2xl"
        } text-left`}
      >
        <span
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${headerToneClasses}`}
        >
          {icon}
        </span>
        <span className="text-[13px] font-extrabold tracking-tight text-gray-900">
          {label}
        </span>
        <span className="text-[11px] font-bold text-gray-500">
          {isSearching ? `${shown} of ${total}` : total}
        </span>
        <ChevronRight
          className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && candidates.length > 0 && (
        <div className="border-[1.5px] border-t-0 border-gray-200 rounded-b-2xl bg-white p-1.5">
          {candidates.map((c, i) => {
            const on = isPending(c);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onPick(c)}
                data-testid={`close-picker-option-${c.key}`}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left ${
                  on ? "bg-indigo-50" : "bg-white"
                } ${i > 0 ? "border-t border-gray-100" : ""}`}
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-extrabold shrink-0"
                  style={{ background: AVATAR_GRADIENTS[c.avatarColor] }}
                >
                  {c.initials}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[12.5px] font-extrabold tracking-tight text-gray-900 truncate">
                    {highlight(c.label, query)}
                  </span>
                  {(c.trades || typeof c.yearsTrading === "number") && (
                    <span className="block text-[10.5px] text-gray-500 truncate">
                      {[c.trades, formatYears(c.yearsTrading)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {(c.fromFriend || c.verified) && (
                    <span className="mt-0.5 flex gap-1.5 text-[9.5px] font-extrabold">
                      {c.fromFriend && (
                        <span className="text-sky-700">★ Friend</span>
                      )}
                      {c.verified && (
                        <span className="text-emerald-700">✓ Verified</span>
                      )}
                    </span>
                  )}
                </span>
                <span
                  className={`w-[19px] h-[19px] rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${
                    on
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "border-gray-300"
                  }`}
                >
                  {on && <Check className="w-3 h-3" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatYears(y: number | null | undefined): string | null {
  if (typeof y !== "number" || !Number.isFinite(y) || y <= 0) return null;
  return `${y} ${y === 1 ? "yr" : "yrs"}`;
}
