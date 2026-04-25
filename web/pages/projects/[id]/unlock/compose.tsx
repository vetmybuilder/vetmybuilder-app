import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";

interface ProjectCtx {
  id: string;
  title: string;
  budget: string;
  outward: string;
  homeownerFirstName: string;
}

const CHIPS: { id: string; label: string; template: string }[] = [
  { id: "intro", label: "Introduce myself",
    template: "Hi {firstName}, I'm {builderName} — I run a small building team based in {area}. I've been working in the local area for {years} years.\n\n" },
  { id: "prior", label: "Share prior work",
    template: "I've done similar work recently — happy to share photos and references on request.\n\n" },
  { id: "timing", label: "Ask about timing",
    template: "When are you hoping to start the work? I have availability {availability}.\n\n" },
  { id: "estimate", label: "Rough estimate",
    template: "Based on what you've shared, a rough ballpark would be {range}. Happy to firm that up after a site visit.\n\n" },
];

export default function Compose() {
  const router = useRouter();
  const api = useApi();
  const pid = router.query.id as string | undefined;
  const [project, setProject] = useState<ProjectCtx | null>(null);
  const [body, setBody] = useState("");
  const [usedChips, setUsedChips] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    api.get(`/api/projects/${pid}`).then(r => {
      if (!cancelled) setProject(r.data.project);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  function insertChip(id: string) {
    if (usedChips[id]) return;
    const chip = CHIPS.find(c => c.id === id)!;
    setBody(b => b + chip.template);
    setUsedChips(u => ({ ...u, [id]: true }));
  }

  async function send() {
    if (!project || !body.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/api/projects/${project.id}/inbox-message`, { body });
      router.push(`/projects/${project.id}`);
    } finally {
      setSending(false);
    }
  }

  if (!project) return <div className="p-8 text-center text-gray-500">Loading…</div>;
  const charCount = body.length;

  return (
    <AuthedOnly>
      <main className="min-h-screen bg-white flex flex-col">
        <div className="flex items-center p-4 border-b">
          <button onClick={() => router.back()} aria-label="Back" className="text-lg">←</button>
          <span className="mx-auto font-bold">New message</span>
          <span className="w-6" />
        </div>
        <div className="mx-4 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <span>✓</span>
          <span>Unlocked — {project.homeownerFirstName} will receive your message in her inbox</span>
        </div>
        <div className="mx-4 mt-3 p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-rose-300 flex items-center justify-center font-bold text-rose-900">
            {project.homeownerFirstName.charAt(0)}
          </div>
          <div>
            <div className="text-sm font-bold">{project.title}</div>
            <div className="text-xs text-gray-500">
              {project.homeownerFirstName} · {project.budget} · {project.outward}
            </div>
          </div>
        </div>

        <div className="px-4 pt-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">Quick starters</div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map(c => (
              <button
                key={c.id}
                onClick={() => insertChip(c.id)}
                disabled={usedChips[c.id]}
                className={`text-xs font-bold px-3 py-2 rounded-full border ${
                  usedChips[c.id]
                    ? "bg-indigo-600 text-white border-indigo-700"
                    : "bg-indigo-50 text-indigo-700 border-indigo-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col px-4 py-4">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500 mb-2">Your message</div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, 600))}
            className="flex-1 min-h-[180px] border-2 border-gray-200 rounded-2xl p-4 text-sm leading-relaxed resize-none focus:border-indigo-400 outline-none"
            placeholder="Write your pitch to the homeowner…"
          />
          <div className="text-right text-xs text-gray-400 mt-1">{charCount} / 600</div>
        </div>

        <div className="p-4 border-t">
          <button
            onClick={send}
            disabled={sending || !body.trim()}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-lg shadow-indigo-600/30 disabled:opacity-50"
          >
            Send to {project.homeownerFirstName}
          </button>
        </div>
      </main>
    </AuthedOnly>
  );
}
