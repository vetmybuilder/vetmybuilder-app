// web/pages/admin/verify-company.tsx
import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/utils/auth";

type VerifyResult = {
  ok?: boolean;
  error?: string;
  // number/search (non-scored) flow:
  method?: "number" | "search";
  matchScore?: number;
  company?: {
    number: string;
    name: string;
    status: string | null;
    dateOfCreation: string | null;
    address?: Record<string, any> | null;
    sicCodes?: string[];
  };
  bestGuess?: { number: string; title: string; score: number };

  // scored flow:
  verdict?: "verified" | "ambiguous" | "no_match";
  best?: {
    score: number;
    number: string | null;
    name: string | null;
    status: string | null;
    dateOfCreation: string | null;
    sicCodes: string[];
    address?: Record<string, any> | null;
  } | null;
  candidates?: VerifyResult["best"][];
};

/** Small admin-only gate (mirrors AdminHeader / Admin pages behaviour) */
function VerifyAdminGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const [allowed, setAllowed] = useState<null | boolean>(null);

  useEffect(() => {
    let alive = true;

    async function check() {
      // Not logged in → send to login with returnTo set
      if (!user) {
        if (!alive) return;
        setAllowed(false);
        router.replace("/login?next=/admin/verify-company");
        return;
      }

      // Try cached admin flag first
      try {
        const cached = sessionStorage.getItem("vmb:isAdmin");
        if (cached === "1") {
          if (!alive) return;
          setAllowed(true);
          return;
        }
      } catch {
        /* ignore */
      }

      // Probe admin endpoint
      try {
        await api.get("/api/admin/tradesmen", {
          params: { page: 1, pageSize: 1, status: "all" },
        });
        if (!alive) return;
        setAllowed(true);
        try {
          sessionStorage.setItem("vmb:isAdmin", "1");
        } catch {}
      } catch {
        if (!alive) return;
        setAllowed(false);
        try {
          sessionStorage.setItem("vmb:isAdmin", "0");
        } catch {}
        router.replace("/");
      }
    }

    check();
    return () => {
      alive = false;
    };
  }, [user, api, router]);

  if (allowed === null) {
    return (
      <div className="px-4 py-8 text-sm text-slate-300">
        Checking admin permissions…
      </div>
    );
  }

  if (!allowed) {
    // Redirect is already in progress
    return null;
  }

  return <>{children}</>;
}

function VerifyCompanyContent() {
  const api = useApi();

  const [name, setName] = useState("Elegant Building Services Limited");
  const [postcode, setPostcode] = useState("E4");
  const [companyNumber, setCompanyNumber] = useState("");
  const [useScoring, setUseScoring] = useState(true);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      (companyNumber && companyNumber.trim().length > 0) ||
      (name && name.trim().length > 0)
    );
  }, [companyNumber, name]);

  async function runLookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const qs = new URLSearchParams();
      if (companyNumber.trim()) {
        qs.set("companyNumber", companyNumber.trim());
      } else {
        qs.set("name", name.trim());
        if (postcode.trim()) qs.set("postcode", postcode.trim());
        if (useScoring) qs.set("scored", "1");
      }
      const { data } = await api.get<VerifyResult>(
        `/api/verify-company?${qs.toString()}`
      );
      setResult(data);
      if (data?.ok === false && data?.error) setError(data.error);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.data?.error ||
        e?.message ||
        "Request failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runLookup().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCls =
    "w-full rounded-lg border border-slate-400/40 bg-slate-500/50 px-3 py-2 text-sm text-white placeholder:text-slate-300 focus:border-slate-300 focus:outline-none disabled:opacity-50";

  return (
    <>
      <Head>
        <title>Admin · Verify Company</title>
        <style>{`body { background: #475569 !important; }`}</style>
      </Head>

      <div
        className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8"
        data-testid="verify-company-page"
      >
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Verify company</h1>
          <p className="mt-1 text-sm text-slate-300">
            Look up a company against Companies House
          </p>
        </div>

        {/* Search form */}
        <form
          onSubmit={runLookup}
          className="rounded-xl border border-slate-400/30 bg-slate-600/40 p-5 mb-5"
          data-testid="verify-form"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Company Number <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={companyNumber}
                onChange={(e) => setCompanyNumber(e.target.value)}
                placeholder="e.g. 12758227"
                className={inputCls}
                data-testid="field-company-number"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                If provided, this is used directly. Otherwise we search by name.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Elegant Building Services Limited"
                className={inputCls}
                data-testid="field-name"
                disabled={!!companyNumber.trim()}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Postcode <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="E4"
                className={inputCls}
                data-testid="field-postcode"
                disabled={!!companyNumber.trim()}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={useScoring}
                onChange={(e) => setUseScoring(e.target.checked)}
                disabled={!!companyNumber.trim()}
                className="accent-slate-300"
              />
              Use scoring (show top matches)
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${loading ? "bg-zinc-400 text-white" : "bg-white text-slate-900 hover:bg-slate-100 active:scale-95"}`}
                disabled={!canSubmit || loading}
                data-testid="btn-lookup"
              >
                {loading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
                {loading ? "Checking…" : "Check Companies House"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-400/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500/50 transition-colors"
                onClick={() => {
                  setCompanyNumber("");
                  setName("Elegant Building Services Limited");
                  setPostcode("E4");
                  setUseScoring(true);
                }}
              >
                Reset defaults
              </button>
            </div>
          </div>
        </form>

        {/* Results */}
        <div className="rounded-xl border border-slate-400/30 bg-slate-600/40 p-5">
          <h2 className="text-base font-semibold text-white mb-4">Result</h2>

          {error ? (
            <p className="text-sm text-rose-300" data-testid="verify-error">
              {error}
            </p>
          ) : null}

          {result ? (
            <div className="grid gap-4">
              {/* Non-scored summary */}
              {result.method ? (
                <div className="text-sm text-slate-200">
                  <span className="font-medium text-white">OK:</span>{" "}
                  {String(!!result.ok)} |{" "}
                  <span className="font-medium text-white">Method:</span>{" "}
                  {result.method}
                  {typeof result.matchScore === "number" ? (
                    <>
                      {" "}
                      | <span className="font-medium text-white">Match score:</span>{" "}
                      {result.matchScore}
                    </>
                  ) : null}
                </div>
              ) : null}

              {/* Scored summary */}
              {typeof result.verdict === "string" ? (
                <div className="rounded-lg border border-slate-500/50 bg-slate-700/50 p-4">
                  <div className="text-sm text-slate-200">
                    <span className="font-semibold text-white">Verdict:</span>{" "}
                    <span
                      className={
                        result.verdict === "verified"
                          ? "text-emerald-400"
                          : result.verdict === "ambiguous"
                          ? "text-amber-400"
                          : "text-rose-400"
                      }
                    >
                      {result.verdict}
                    </span>
                  </div>

                  {result.best ? (
                    <div className="mt-3 grid grid-cols-2 gap-1 text-sm">
                      {(
                        [
                          ["Best score", result.best.score],
                          ["Best name", result.best.name || "—"],
                          ["Best number", result.best.number || "—"],
                          ["Status", result.best.status || "—"],
                          result.best.sicCodes?.length
                            ? ["SIC", result.best.sicCodes.join(", ")]
                            : null,
                        ] as Array<[string, string | number] | null>
                      )
                        .filter((x): x is [string, string | number] => x !== null)
                        .map(([k, v]) => (
                          <div key={String(k)}>
                            <span className="font-medium text-slate-300">{k}:</span>{" "}
                            <span className="text-slate-100">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  ) : null}

                  {Array.isArray(result.candidates) && result.candidates.length ? (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-white mb-2">
                        Top candidates
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-slate-500/50">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-600/80">
                            <tr>
                              {["Score", "Name", "Number", "Status", "Postcode"].map((h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wide border-b border-slate-500/60"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-500/30">
                            {result.candidates.map((c, i) => (
                              <tr
                                key={i}
                                className={
                                  i === 0
                                    ? "bg-emerald-900/30"
                                    : "bg-slate-700/40"
                                }
                              >
                                <td className="px-3 py-2 text-slate-200">{c?.score ?? "—"}</td>
                                <td className="px-3 py-2 text-slate-200">{c?.name || "—"}</td>
                                <td className="px-3 py-2 text-slate-200">{c?.number || "—"}</td>
                                <td className="px-3 py-2 text-slate-200">{c?.status || "—"}</td>
                                <td className="px-3 py-2 text-slate-200">
                                  {c?.address?.postal_code ||
                                    (c?.address as any)?.post_code ||
                                    "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Non-scored single company summary */}
              {result.company ? (
                <div
                  className="rounded-lg border border-slate-500/50 bg-slate-700/50 p-4 grid grid-cols-2 gap-1 text-sm"
                  data-testid="verify-summary"
                >
                  {(
                    [
                      ["Name", result.company.name],
                      ["Number", result.company.number],
                      ["Status", result.company.status ?? "—"],
                      ["Incorporated", result.company.dateOfCreation ?? "—"],
                      Array.isArray(result.company.sicCodes) && result.company.sicCodes.length > 0
                        ? ["SIC", result.company.sicCodes.join(", ")]
                        : null,
                    ] as Array<[string, string | number] | null>
                  )
                    .filter((x): x is [string, string | number] => x !== null)
                    .map(([k, v]) => (
                      <div key={String(k)}>
                        <span className="font-medium text-slate-300">{k}:</span>{" "}
                        <span className="text-slate-100">{String(v)}</span>
                      </div>
                    ))}
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Raw JSON
                </label>
                <pre
                  className="overflow-auto rounded-lg border border-slate-500/50 bg-slate-900/60 text-slate-100 text-xs p-3"
                  data-testid="verify-json"
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          ) : !error && loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <p className="text-sm text-slate-400">Run a lookup to see results.</p>
          )}
        </div>
      </div>
    </>
  );
}

export default function VerifyCompanyAdminPage() {
  return (
    <AuthedOnly>
      <VerifyAdminGate>
        <VerifyCompanyContent />
      </VerifyAdminGate>
    </AuthedOnly>
  );
}
