// web/pages/admin/sales-script.tsx
// Admin sales-script tool. Three tabs:
//   - Browse: collapsible Q/A grouped by category (click a Q to reveal A).
//   - Teleprompter: large-text scrolling read-mode for during-call use.
//   - Edit: primer textarea + raw script_json textarea + Save / Regenerate.
//
// Backed by /api/admin/sales-script (GET / PUT / POST generate). The
// generator returns a JSON document with { categories: [{ name, items:
// [{ q, a }] }] } - we parse it once on load and render.

import Head from "next/head";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { useApi } from "@/utils/api";

type QA = { q: string; a: string };
type Category = { name: string; items: QA[] };
type ScriptDoc = { categories: Category[] };

type Row = {
  primer: string;
  script_json: string | null;
  generated_at: string | null;
  updated_at: string;
};

function parseScript(json: string | null): ScriptDoc | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.categories)) return null;
    return parsed as ScriptDoc;
  } catch {
    return null;
  }
}

export default function AdminSalesScript() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const api = useApi();
  const [row, setRow] = useState<Row | null>(null);
  const [tab, setTab] = useState<"browse" | "teleprompter" | "edit">(
    "browse",
  );
  const [primerDraft, setPrimerDraft] = useState("");
  const [jsonDraft, setJsonDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await api.get("/api/admin/sales-script");
      setRow(data);
      setPrimerDraft(data.primer || "");
      setJsonDraft(data.script_json || "");
    } catch (e: any) {
      setFlash({ kind: "err", text: e?.message || "Load failed" });
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const body: any = { primer: primerDraft };
      if (jsonDraft) body.script_json = jsonDraft;
      await api.put("/api/admin/sales-script", body);
      setFlash({ kind: "ok", text: "Saved." });
      await fetchData();
    } catch (e: any) {
      setFlash({
        kind: "err",
        text: e?.response?.data?.error || e?.message || "Save failed",
      });
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (busy) return;
    if (jsonDraft && jsonDraft !== (row?.script_json || "")) {
      if (
        !window.confirm(
          "You have unsaved edits to the script. Regenerating will overwrite them. Continue?",
        )
      )
        return;
    }
    setBusy(true);
    setFlash(null);
    try {
      const { data } = await api.post("/api/admin/sales-script/generate", {});
      setFlash({ kind: "ok", text: "Regenerated." });
      setJsonDraft(data.script_json || "");
      await fetchData();
    } catch (e: any) {
      setFlash({
        kind: "err",
        text:
          e?.response?.data?.error || e?.message || "Regeneration failed",
      });
    } finally {
      setBusy(false);
    }
  }

  const script = parseScript(row?.script_json || null);

  return (
    <>
      <Head>
        <title>Sales script - Admin - VetMyBuilder</title>
      </Head>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-black text-zinc-900">Sales script</h1>
          <AdminRefreshButton onRefresh={fetchData} />
        </div>

        <div className="mb-4 inline-flex rounded-xl border border-zinc-200 bg-white p-1">
          {(
            [
              ["browse", "Browse"],
              ["teleprompter", "Teleprompter"],
              ["edit", "Edit"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold ${
                tab === t
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
              data-testid={`sales-script-tab-${t}`}
            >
              {label}
            </button>
          ))}
        </div>

        {flash && (
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-sm font-semibold ${
              flash.kind === "ok"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
            data-testid="sales-script-flash"
          >
            {flash.text}
          </div>
        )}

        {tab === "browse" && (
          <BrowseView
            script={script}
            generatedAt={row?.generated_at || null}
          />
        )}

        {tab === "teleprompter" && <TeleprompterView script={script} />}

        {tab === "edit" && (
          <EditView
            primer={primerDraft}
            setPrimer={setPrimerDraft}
            json={jsonDraft}
            setJson={setJsonDraft}
            onSave={save}
            onRegenerate={regenerate}
            busy={busy}
          />
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800"
      data-testid="sales-script-empty"
    >
      <p className="font-semibold">No script yet.</p>
      <p className="text-sm mt-1">
        Click <span className="font-bold">Edit</span> then{" "}
        <span className="font-bold">Regenerate via LLM</span> to create one.
      </p>
    </div>
  );
}

function BrowseView({
  script,
  generatedAt,
}: {
  script: ScriptDoc | null;
  generatedAt: string | null;
}) {
  if (!script) return <EmptyState />;
  return (
    <div className="space-y-6" data-testid="sales-script-browse">
      {generatedAt && (
        <div className="text-[11px] uppercase tracking-wider font-bold text-zinc-500">
          Generated {new Date(generatedAt).toLocaleString("en-GB")}
        </div>
      )}
      {script.categories.map((cat, ci) => (
        <CategoryBlock key={ci} category={cat} />
      ))}
    </div>
  );
}

function CategoryBlock({ category }: { category: Category }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
      <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
        <h2 className="text-[15px] font-extrabold text-indigo-900">
          {category.name}
        </h2>
      </div>
      <ul className="divide-y divide-zinc-100">
        {category.items.map((item, ii) => (
          <QARow key={ii} item={item} />
        ))}
      </ul>
    </div>
  );
}

function QARow({ item }: { item: QA }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-3 flex items-start gap-3 hover:bg-zinc-50"
      >
        <span
          className={`mt-0.5 inline-block w-4 h-4 text-zinc-500 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span className="flex-1 font-semibold text-zinc-900">{item.q}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 pl-12 text-[14.5px] text-zinc-700 leading-relaxed whitespace-pre-line">
          {item.a}
        </div>
      )}
    </li>
  );
}

function TeleprompterView({ script }: { script: ScriptDoc | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(40); // pixels per second

  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      el.scrollTop += speed * dt;
      // Stop at the bottom
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  if (!script) return <EmptyState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-zinc-900 text-white px-4 py-2">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          className="px-3 py-1 rounded-lg bg-emerald-500 text-white text-sm font-extrabold"
          data-testid="teleprompter-play"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
          }}
          className="px-3 py-1 rounded-lg bg-zinc-700 text-white text-sm font-semibold"
        >
          Reset
        </button>
        <label className="ml-3 flex items-center gap-2 text-xs">
          <span className="opacity-70">Speed</span>
          <input
            type="range"
            min={10}
            max={200}
            step={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <span className="font-mono">{speed} px/s</span>
        </label>
      </div>
      <div
        ref={scrollRef}
        className="rounded-2xl border border-zinc-200 bg-zinc-900 text-white h-[70vh] overflow-y-auto px-10 py-12 leading-relaxed"
        data-testid="teleprompter-stage"
      >
        <div className="text-[28px] font-bold space-y-10 max-w-3xl mx-auto">
          {script.categories.map((cat, ci) => (
            <div key={ci} className="space-y-6">
              <div className="text-[18px] uppercase tracking-[0.18em] text-emerald-300 font-extrabold">
                {cat.name}
              </div>
              {cat.items.map((item, ii) => (
                <div key={ii} className="space-y-3">
                  <div className="text-emerald-200">{item.q}</div>
                  <div className="text-white">{item.a}</div>
                </div>
              ))}
            </div>
          ))}
          <div className="h-[60vh]" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function EditView({
  primer,
  setPrimer,
  json,
  setJson,
  onSave,
  onRegenerate,
  busy,
}: {
  primer: string;
  setPrimer: (s: string) => void;
  json: string;
  setJson: (s: string) => void;
  onSave: () => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
          Pitch primer
        </span>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          This is what the LLM reads as source-of-truth before writing the
          script. Edit freely.
        </p>
        <textarea
          value={primer}
          onChange={(e) => setPrimer(e.target.value)}
          rows={14}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-[13px] font-mono"
          data-testid="sales-script-primer"
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">
          Script JSON
        </span>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Structured Q&amp;A by category. Must parse as JSON with a{" "}
          <code>categories</code> array of <code>{`{ name, items: [{ q, a }] }`}</code>.
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={18}
          className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-mono"
          data-testid="sales-script-json"
        />
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-extrabold disabled:opacity-50"
          data-testid="sales-script-save"
        >
          {busy ? "Working..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-extrabold disabled:opacity-50"
          data-testid="sales-script-regenerate"
        >
          {busy ? "Working..." : "Regenerate via LLM"}
        </button>
      </div>
    </div>
  );
}
