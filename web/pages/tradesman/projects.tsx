import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import TradesmanProjectAccordionRow from "@/components/tradesmen/TradesmanProjectAccordionRow";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  createdAt: string;

  // optional extras that may be present from /tradesmen/jobs
  description?: string;
  propertyType?: string;
  bedrooms?: number;
  status?: "pending" | "live" | "archived" | "completed";
  ownerUserId?: string;
  budget?: string | null; // for client-side budget filtering
};

const BUDGET_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any budget" },
  { value: "Under £5k", label: "Under £5k" },
  { value: "£5k–£15k", label: "£5k–£15k" },
  { value: "£15k–£30k", label: "£15k–£30k" },
  { value: "£30k–£60k", label: "£30k–£60k" },
  { value: "£60k+", label: "£60k+" },
];

export default function TradesmanProjects() {
  const api = useApi();
  const { user, loading } = useAuth();

  /* ---------- filters ---------- */
  const [q, setQ] = useState("");
  const [near, setNear] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [budget, setBudget] = useState<string>("");

  /* ---------- data / ui ---------- */
  const [items, setItems] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [gate, setGate] = useState<"none" | "notActive" | "noProfile">("none");

  // which project row is expanded (accordion)
  const [openId, setOpenId] = useState<number | null>(null);

  const canQuery = useMemo(() => !!user && !loading, [user, loading]);

  useEffect(() => {
    if (!canQuery) return;

    let cancelled = false;

    const run = async () => {
      setBusy(true);
      setErr(null);
      setGate("none");
      setOpenId(null); // collapse all when filters change

      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (near.trim()) params.set("near", near.trim());
        params.set("order", order);
        params.set("limit", "50");

        const { data } = await api.get(
          `/api/tradesmen/jobs?${params.toString()}`
        );
        if (cancelled) return;

        // ✅ NEW: handle soft gate codes that come back with 200
        if (data?.code === "NOT_ACTIVE") {
          setGate("notActive");
          setItems([]);
          setErr(null);
          return;
        }
        if (data?.code === "NO_PROFILE") {
          setGate("noProfile");
          setItems([]);
          setErr(null);
          return;
        }

        const nextItems: Project[] = Array.isArray(data?.items)
          ? data.items
          : [];
        setItems(nextItems);
        setGate("none");
      } catch (e: any) {
        if (cancelled) return;

        const status = e?.response?.status;
        const code = e?.response?.data?.code;

        // ✅ keep backwards-compat for old 403 behaviour
        if (status === 403 && code === "NOT_ACTIVE") {
          setGate("notActive");
          setItems([]);
          setErr(null);
        } else if (status === 403 && code === "NO_PROFILE") {
          setGate("noProfile");
          setItems([]);
          setErr(null);
        } else {
          const msg =
            e?.response?.data?.error || e?.message || "Failed to load projects";
          setErr(msg);
          setItems([]);
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [canQuery, q, near, order, api]);

  // Client-side budget filter so we don’t have to touch backend yet
  const filteredItems = useMemo(() => {
    if (!budget) return items;
    const wanted = budget.toLowerCase();
    return items.filter((p) => {
      const b = (p.budget || "").toString().trim().toLowerCase();
      if (!b) return false;
      return b === wanted;
    });
  }, [items, budget]);

  return (
    <>
      <Head>
        <title>Jobs list • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6"
        data-testid="tradesman-projects-page"
      >
        {/* Heading + primary actions */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              Jobs list
            </h1>
            <p className="mt-1 text-sm text-slate-600 max-w-2xl">
              Browse jobs posted by homeowners that match your trade and areas
              you cover. Use the filters to narrow down what you&apos;re looking
              for.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/tradesman/profile"
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-slate-900/90 shadow-sm"
              data-testid="link-view-profile"
            >
              View my profile
            </Link>
          </div>
        </div>

        {/* NOT SIGNED IN */}
        {!user && !loading && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
            data-testid="gate-not-signed-in"
          >
            Please{" "}
            <Link className="link" href="/login">
              sign in
            </Link>{" "}
            to view projects.
          </div>
        )}

        {/* GATES */}
        {user && gate === "notActive" && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 mb-4"
            data-testid="gate-not-active"
          >
            <p className="font-medium">Your trade account is being reviewed.</p>
            <p className="text-sm mt-1">
              You’ll be able to view and contact projects once your account is{" "}
              <strong>active</strong>. You can still update your details on{" "}
              <Link className="link" href="/tradesman/register">
                Manage profile
              </Link>
              .
            </p>
          </div>
        )}

        {user && gate === "noProfile" && (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 mb-4"
            data-testid="gate-no-profile"
          >
            <p className="font-medium">
              Create your trade profile to continue.
            </p>
            <p className="text-sm mt-1">
              Go to{" "}
              <Link className="link" href="/tradesman/register">
                Manage profile
              </Link>{" "}
              and complete your details.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <input
            className="input"
            placeholder="Search by project (e.g. bathroom refit)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="filter-q"
          />
          <input
            className="input"
            placeholder="Near (e.g. E4 or Chingford)"
            value={near}
            onChange={(e) => setNear(e.target.value)}
            data-testid="filter-near"
          />
          <select
            className="input"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            data-testid="filter-budget"
          >
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.value || "any"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={order}
            onChange={(e) => setOrder(e.target.value as any)}
            data-testid="filter-order"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
          </select>
        </div>

        {/* Accordion list */}
        {user && gate === "none" && !loading && (
          <div
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            data-testid="tradesman-projects-accordion"
          >
            {err && (
              <div className="px-4 py-4 text-sm text-red-600 border-b border-red-100">
                {err}
              </div>
            )}

            {!err && filteredItems.length === 0 && !busy && (
              <div className="px-4 py-6 text-sm text-slate-500">
                No projects found.
              </div>
            )}

            {!err &&
              filteredItems.map((p) => (
                <TradesmanProjectAccordionRow
                  key={p.id}
                  project={p}
                  expanded={openId === p.id}
                  onToggle={() =>
                    setOpenId((curr) => (curr === p.id ? null : p.id))
                  }
                />
              ))}

            {busy && (
              <div className="px-4 py-3 text-xs text-slate-400 border-t">
                Updating results…
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
