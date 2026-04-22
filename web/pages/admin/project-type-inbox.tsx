import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PROJECT_TYPES } from "@/types/projectTypes";

type InboxItem = {
  normalized: string;
  count: number;
  lastSeen: string;
  examples: string[];
  lastSuggestions: string[];
  lastMatched: string | null;
};

export default function ProjectTypeInbox() {
  const api = useApi();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [minCount, setMinCount] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const typeLabels = useMemo(
    () => PROJECT_TYPES.map((t) => t.category).sort(),
    []
  );

  async function fetchInbox() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get("/api/project-types/queries", {
        params: { q, minCount, limit: 200 },
      });
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addSynonym(targetLabel: string, synonym: string) {
    setNotice(null);
    try {
      await api.post("/api/project-types/synonyms", {
        label: targetLabel,
        synonym,
      });
      setNotice(`Added “${synonym}” as a synonym of “${targetLabel}”.`);
      fetchInbox();
    } catch (e: any) {
      setNotice(
        e?.response?.data?.error ||
          "Action failed (addSynonym). Ensure the route exists."
      );
    }
  }

  async function createType(newLabel: string) {
    setNotice(null);
    try {
      await api.post("/api/project-types", {
        label: newLabel,
        synonyms: [],
        buckets: [],
      });
      setNotice(`Created new type “${newLabel}”.`);
      fetchInbox();
    } catch (e: any) {
      setNotice(
        e?.response?.data?.error ||
          "Action failed (createType). Ensure the route exists."
      );
    }
  }

  return (
    <AuthedOnly>
      <div
        className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8"
        data-testid="pt-inbox"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Project Type Inbox
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Curate unknown or low-confidence project types from user input.
            </p>
          </div>
          <Link
            href="/projects"
            className="btn-outline"
            data-testid="btn-back-projects"
          >
            ← Back to Projects
          </Link>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Search</label>
            <input
              className="input"
              placeholder="e.g. drvway, gardan…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="filter-q"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Min count</label>
            <input
              className="input"
              type="number"
              min={1}
              value={minCount}
              onChange={(e) =>
                setMinCount(Math.max(1, Number(e.target.value || 1)))
              }
              data-testid="filter-min"
            />
          </div>
          <button
            onClick={fetchInbox}
            className="btn"
            disabled={loading}
            data-testid="btn-refresh"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          {err && (
            <span
              className="text-sm text-red-600"
              role="alert"
              data-testid="error"
            >
              {err}
            </span>
          )}
          {notice && (
            <span className="text-sm text-emerald-700" data-testid="notice">
              {notice}
            </span>
          )}
        </div>

        <div className="rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 w-[22%]">User term (normalized)</th>
                <th className="px-4 py-3 w-[8%]">Count</th>
                <th className="px-4 py-3 w-[18%]">Last seen</th>
                <th className="px-4 py-3 w-[22%]">Examples</th>
                <th className="px-4 py-3 w-[20%]">Last suggestions</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-gray-500"
                  >
                    Nothing to curate. 🎉
                  </td>
                </tr>
              )}
              {items.map((it, idx) => (
                <Row
                  key={it.normalized + idx}
                  it={it}
                  typeLabels={typeLabels}
                  onAddSynonym={addSynonym}
                  onCreateType={createType}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AuthedOnly>
  );
}

function Row({
  it,
  typeLabels,
  onAddSynonym,
  onCreateType,
}: {
  it: InboxItem;
  typeLabels: string[];
  onAddSynonym: (label: string, synonym: string) => Promise<void>;
  onCreateType: (label: string) => Promise<void>;
}) {
  const [synTo, setSynTo] = useState<string>(typeLabels[0] || "");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const examples = it.examples.join(", ");
  const suggestions = it.lastSuggestions.join(", ");

  async function handleAddSyn() {
    if (!synTo) return;
    setBusy(true);
    await onAddSynonym(synTo, it.normalized);
    setBusy(false);
  }

  async function handleCreate() {
    setBusy(true);
    await onCreateType(titleCase(it.normalized));
    setBusy(false);
  }

  return (
    <tr className="border-t align-top" data-testid={`row-${it.normalized}`}>
      <td className="px-4 py-3 font-medium text-gray-900">{it.normalized}</td>
      <td className="px-4 py-3">{it.count}</td>
      <td className="px-4 py-3 text-gray-500">{fmtDate(it.lastSeen)}</td>
      <td className="px-4 py-3">
        <div className="text-gray-900">{examples || "—"}</div>
        {it.lastMatched && (
          <div className="text-xs text-gray-500 mt-1">
            Last matched: <span className="font-medium">{it.lastMatched}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-gray-700">{suggestions || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-2"
            data-testid="action-add-synonym"
          >
            <select
              className="input"
              value={synTo}
              onChange={(e) => setSynTo(e.target.value)}
              aria-label="Target type"
            >
              {typeLabels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              className={`btn inline-flex items-center gap-2 ${busy ? "!bg-zinc-400" : "active:scale-95"}`}
              onClick={handleAddSyn}
              disabled={busy}
              title="Add as synonym to selected type"
            >
              {busy && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
              {busy ? "Working…" : "Add as synonym"}
            </button>
          </div>

          <div
            className="flex items-center gap-2"
            data-testid="action-create-type"
          >
            <button
              className="btn-outline"
              onClick={() => setCreating((s) => !s)}
              disabled={busy}
            >
              {creating ? "Cancel" : "Create new type…"}
            </button>
            {creating && (
              <button className={`btn inline-flex items-center gap-2 ${busy ? “!bg-zinc-400” : “active:scale-95”}`} onClick={handleCreate} disabled={busy}>
                {busy && <svg className=”h-4 w-4 animate-spin” viewBox=”0 0 24 24” fill=”none”><circle cx=”12” cy=”12” r=”10” stroke=”currentColor” strokeWidth=”3” className=”opacity-25” /><path d=”M4 12a8 8 0 018-8” stroke=”currentColor” strokeWidth=”3” strokeLinecap=”round” className=”opacity-75” /></svg>}
                {busy ? “Creating...” : `Create “${titleCase(it.normalized)}”`}
              </button>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ---------- tiny utils ---------- */
function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function titleCase(s: string) {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
