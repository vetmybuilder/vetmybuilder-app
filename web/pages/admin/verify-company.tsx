// web/pages/admin/verify-company.tsx
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
      <div className="px-4 py-8 text-sm text-slate-600">
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

  // Prefill with your example
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

  return (
    <div
      className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8"
      data-testid="verify-company-page"
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Verify company
        </h1>
      </div>

      <form
        onSubmit={runLookup}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        data-testid="verify-form"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Company Number (optional)
            </label>
            <input
              value={companyNumber}
              onChange={(e) => setCompanyNumber(e.target.value)}
              placeholder="e.g. 12758227"
              className="input w-full"
              data-testid="field-company-number"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              If provided, this is used directly. Otherwise we search by name.
            </p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Elegant Building Services Limited"
              className="input w-full"
              data-testid="field-name"
              disabled={!!companyNumber.trim()}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Postcode (optional)
            </label>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="E4"
              className="input w-full"
              data-testid="field-postcode"
              disabled={!!companyNumber.trim()}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useScoring}
              onChange={(e) => setUseScoring(e.target.checked)}
              disabled={!!companyNumber.trim()}
            />
            Use scoring (show top matches)
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              className="btn"
              disabled={!canSubmit || loading}
              data-testid="btn-lookup"
            >
              {loading ? "Checking…" : "Check Companies House"}
            </button>
            <button
              type="button"
              className="btn-secondary"
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
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Result</h2>

        {error ? (
          <p className="text-sm text-rose-600" data-testid="verify-error">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="grid gap-3">
            {/* Non-scored summary */}
            {result.method ? (
              <div className="text-sm">
                <span className="font-medium">OK:</span> {String(!!result.ok)} |{" "}
                <span className="font-medium">Method:</span> {result.method}
                {typeof result.matchScore === "number" ? (
                  <>
                    {" "}
                    | <span className="font-medium">Match score:</span>{" "}
                    {result.matchScore}
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Scored summary */}
            {typeof result.verdict === "string" ? (
              <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                <div className="text-sm">
                  <span className="font-medium">Verdict:</span> {result.verdict}
                </div>

                {result.best ? (
                  <div className="mt-2 text-sm">
                    <div>
                      <span className="font-medium">Best score:</span>{" "}
                      {result.best.score}
                    </div>
                    <div>
                      <span className="font-medium">Best name:</span>{" "}
                      {result.best.name || "—"}
                    </div>
                    <div>
                      <span className="font-medium">Best number:</span>{" "}
                      {result.best.number || "—"}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span>{" "}
                      {result.best.status || "—"}
                    </div>
                    {result.best.sicCodes?.length ? (
                      <div>
                        <span className="font-medium">SIC:</span>{" "}
                        {result.best.sicCodes.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(result.candidates) &&
                result.candidates.length ? (
                  <div className="mt-3">
                    <div className="font-medium text-sm mb-1">
                      Top candidates
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm border">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="p-2 text-left">Score</th>
                            <th className="p-2 text-left">Name</th>
                            <th className="p-2 text-left">Number</th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-left">Postcode</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.candidates.map((c, i) => (
                            <tr
                              key={i}
                              className={i === 0 ? "bg-emerald-50" : ""}
                            >
                              <td className="p-2">{c?.score ?? "—"}</td>
                              <td className="p-2">{c?.name || "—"}</td>
                              <td className="p-2">{c?.number || "—"}</td>
                              <td className="p-2">{c?.status || "—"}</td>
                              <td className="p-2">
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
                className="rounded-lg bg-slate-50 p-3 border border-slate-200"
                data-testid="verify-summary"
              >
                <div className="text-sm">
                  <span className="font-medium">Name:</span>{" "}
                  {result.company.name}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Number:</span>{" "}
                  {result.company.number}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Status:</span>{" "}
                  {result.company.status ?? "—"}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Incorporated:</span>{" "}
                  {result.company.dateOfCreation ?? "—"}
                </div>
                {Array.isArray(result.company.sicCodes) &&
                result.company.sicCodes.length > 0 ? (
                  <div className="text-sm">
                    <span className="font-medium">SIC:</span>{" "}
                    {result.company.sicCodes.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Raw JSON
              </label>
              <pre
                className="overflow-auto rounded-lg border border-slate-200 bg-slate-900 text-slate-100 text-xs p-3"
                data-testid="verify-json"
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        ) : !error && loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <p className="text-sm text-slate-500">Run a lookup to see results.</p>
        )}
      </div>
    </div>
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
