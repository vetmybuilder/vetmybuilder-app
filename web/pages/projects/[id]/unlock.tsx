import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import AuthedOnly from "@/components/AuthedOnly";

interface ProjectInfo {
  id: string;
  title: string;
  budget: string;
  outward: string;
  startWindow: string;
  description: string;
  trades: string[];
  homeownerFirstName: string;
}

export default function ProjectUnlock() {
  const router = useRouter();
  const api = useApi();
  const pid = router.query.id as string | undefined;
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [priceP, setPriceP] = useState(0);

  useEffect(() => {
    if (!pid) return;
    let cancelled = false;
    api.get(`/api/projects/${pid}/unlock-preview`).then(r => {
      if (!cancelled) {
        setProject(r.data.project);
        setPriceP(r.data.unlockPrice);
      }
    }).catch(() => {
      // fallback to generic project endpoint if unlock-preview doesn't exist
      api.get(`/api/projects/${pid}`).then(r => {
        if (!cancelled) {
          setProject(r.data.project ?? null);
          setPriceP(r.data.unlockPrice ?? 0);
        }
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  if (!project) return <div className="p-8 text-center text-gray-500">Loading…</div>;

  const priceStr = `£${(priceP / 100).toFixed(2)}`;

  async function unlock() {
    const res = await api.post(`/api/projects/${project!.id}/unlock-contact/checkout`, {});
    if (res.data?.url) window.location.href = res.data.url;
    else router.push(`/projects/${project!.id}/unlock/compose`);
  }

  return (
    <AuthedOnly>
      <main className="min-h-screen bg-white flex flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <h1 className="text-2xl font-extrabold leading-tight">{project.title}</h1>
          <div className="flex flex-wrap gap-2 mt-3">
            {project.budget && <Pill tone="green">{project.budget}</Pill>}
            {project.outward && <Pill tone="indigo">{project.outward}</Pill>}
            {project.startWindow && <Pill>{project.startWindow}</Pill>}
          </div>
          <div className="mt-4 py-3 border-y text-sm text-gray-600">
            {project.homeownerFirstName} · Posted recently
          </div>
          <Label>The job</Label>
          <p className="mt-1 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
            {project.description}
          </p>
          {project.trades.length > 0 && (
            <>
              <Label>Trades needed</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {project.trades.map(t => <Pill key={t}>{t}</Pill>)}
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t">
          <button
            onClick={unlock}
            className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-extrabold shadow-lg shadow-indigo-600/30"
          >
            🔒 Unlock this job — {priceStr}
          </button>
          <div className="my-3 flex items-center gap-3 text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
            <span className="flex-1 h-px bg-gray-200" />or<span className="flex-1 h-px bg-gray-200" />
          </div>
          <button
            onClick={() => router.push("/tradesman/billing")}
            className="w-full py-3 rounded-2xl border-2 border-indigo-200 text-indigo-700 font-bold"
          >
            Subscribe for unlimited matches
            <span className="block text-xs text-indigo-500 font-semibold mt-1">
              £9.99 / month · appear in homeowner feeds
            </span>
          </button>
        </div>
      </main>
    </AuthedOnly>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "green" | "indigo" }) {
  const style = tone === "green" ? "bg-emerald-50 text-emerald-800"
              : tone === "indigo" ? "bg-indigo-50 text-indigo-700"
              : "bg-gray-100 text-gray-800";
  return <span className={`inline-flex text-xs font-semibold ${style} rounded-full px-3 py-1`}>{children}</span>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{children}</div>;
}
