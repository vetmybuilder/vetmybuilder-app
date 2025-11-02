// web/pages/projects/[id]/edit.tsx
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import AutoCompleteInput from "@/components/forms/AutoCompleteInput";
import {
  suggestProjectTypes,
  QUICK_PICKS,
  toCanonicalType,
} from "@/types/projectTypes";

/* ===== Outer page: auth + gate (prevents flicker) ===== */
export default function EditProjectPage() {
  return (
    <AuthedOnly>
      <EditGate />
    </AuthedOnly>
  );
}

/* ===== Little gate that decides where to send the user (no flicker) ===== */
function EditGate() {
  const api = useApi();
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [status, setStatus] = useState<"checking" | "ok" | "redirect">(
    "checking"
  );

  useEffect(() => {
    let alive = true;
    if (!router.isReady || authLoading) return;

    // Fast cached path
    try {
      if (sessionStorage.getItem("vmb:isTradesman") === "1") {
        setStatus("redirect");
        router.replace("/tradesman/projects");
        return;
      }
    } catch {}

    // Authoritative path
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        const isT =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
        if (!alive) return;
        if (isT) {
          try {
            sessionStorage.setItem("vmb:isTradesman", "1");
          } catch {}
          setStatus("redirect");
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // Not a tradesman; continue
      }
      if (alive) setStatus("ok");
    })();

    return () => {
      alive = false;
    };
  }, [api, router, authLoading]);

  if (status === "redirect") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Redirecting…
      </div>
    );
  }

  if (status !== "ok") {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return <EditProjectInner />;
}

/* ===== Shared helpers (match Create page) ===== */
const PROPERTY_TYPES = [
  "Detached",
  "Semi-Detached",
  "Terraced",
  "End of Terrace",
  "Flat",
  "Bungalow",
  "Cottage",
  "Maisonette",
  "Townhouse",
  "Other",
] as const;

const LONDON_LOCATIONS = [
  "E4",
  "E17",
  "Walthamstow",
  "Chingford",
  "Hackney",
  "Enfield",
  "Islington",
  "Waltham Forest",
  "London",
];

const UK_POSTCODE_HINT =
  /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})$/i;

function locationSuggestions(query: string): string[] {
  const q = query.toLowerCase();
  return LONDON_LOCATIONS.filter((s) => s.toLowerCase().includes(q));
}

/* ===== Actual edit UI ===== */
function EditProjectInner() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { id } = router.query;

  const [form, setForm] = useState({
    name: "",
    type: "",
    location: "",
    description: "",
    propertyType: "",
    bedrooms: 0 as number | string,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Load project once ready
  useEffect(() => {
    if (!router.isReady || authLoading || !user || !id) return;

    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        if (!alive) return;
        const p = data.project;
        setForm({
          name: p.name ?? "",
          type: p.type ?? "",
          location: p.location ?? "",
          description: p.description ?? "",
          propertyType: p.propertyType ?? "",
          bedrooms: Number(p.bedrooms ?? 0),
        });
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const message =
          e?.data?.error || e?.response?.data?.error || e?.message || "";
        if (status === 401 || /bearer token/i.test(String(message))) {
          setErr("You need to sign in again to edit this project.");
        } else {
          setErr("Failed to load project");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, router.isReady, authLoading, user]);

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        // keep user's exact type text, but nudge toward canonical in UI hint
        bedrooms: Number(form.bedrooms) || 0,
      };
      const { data } = await api.put(`/api/projects/${id}`, payload);
      router.replace(`/projects/${data.project.id}`);
    } catch (e: any) {
      const message =
        e?.response?.data?.error ||
        e?.data?.error ||
        e?.message ||
        "Failed to update";
      setErr(message);
    } finally {
      setBusy(false);
    }
  };

  // control ids for labels & testing
  const ids = useMemo(
    () => ({
      name: "project-name",
      type: "project-type",
      location: "project-location",
      propertyType: "project-property-type",
      bedrooms: "project-bedrooms",
      description: "project-description",
    }),
    []
  );

  const postcodeLooksValid =
    !form.location || UK_POSTCODE_HINT.test(String(form.location).trim());

  // For the gentle hint below the Type field
  const canonicalType =
    form.type && form.type !== toCanonicalType(form.type)
      ? toCanonicalType(form.type)
      : "";

  const inputRef = useRef<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  >(null);

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") e.preventDefault();
  };

  return (
    <div
      className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8"
      data-testid="project-edit-page"
      aria-label="Edit Project Page"
    >
      {/* Header band */}
      <div
        className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm"
        data-testid="project-edit-header"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-testid="project-edit-title"
            >
              Edit Project
            </h1>
            <p
              className="mt-1 text-sm text-slate-500"
              data-testid="project-edit-subtitle"
            >
              Update the details and save your changes.
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="btn-outline"
            data-testid="btn-back"
            aria-label="Back to project"
          >
            Back
          </Link>
        </div>
      </div>

      {authLoading || loading ? (
        <div className="card" data-testid="project-edit-loading">
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      ) : err ? (
        <div className="card" data-testid="project-edit-error">
          <p className="text-red-600" data-testid="project-edit-error-message">
            {err}
          </p>
          <Link
            href="/login"
            className="btn mt-3"
            data-testid="btn-go-to-sign-in"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="card" data-testid="project-edit-card">
          <form
            onSubmit={submit}
            className="grid grid-cols-1 gap-3 max-w-xl"
            role="form"
            aria-label="Edit project form"
            data-testid="project-edit-form"
          >
            {/* Name */}
            <div>
              <label htmlFor={ids.name} className="text-xs text-slate-500">
                Name
              </label>
              <input
                id={ids.name}
                name="name"
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                data-testid="input-name"
              />
            </div>

            {/* Type (with suggestions like Create page) */}
            <div>
              <AutoCompleteInput
                id={ids.type}
                label="Type of project"
                placeholder="Start typing (e.g., Kitchen remodel, Bathroom refit, Roofing, Driveway…) — typos OK"
                value={form.type}
                onChange={(v) => set("type", v)}
                onEnter={() => {}}
                getSuggestions={(q) => suggestProjectTypes(q, 8)}
                quickPicks={QUICK_PICKS}
                onQuickPick={(v) => set("type", v)}
                ariaLabel="Type of project"
                data-testid="input-type"
              />
              {canonicalType && (
                <p className="text-xs text-gray-500 mt-1">
                  Hint: we recognise this as{" "}
                  <strong>{toCanonicalType(form.type)}</strong>.
                </p>
              )}
            </div>

            {/* Location */}
            <div>
              <AutoCompleteInput
                id={ids.location}
                label="Location"
                placeholder="Postcode, borough, or city (e.g. E4, Walthamstow)"
                value={form.location}
                onChange={(v) => set("location", v.toUpperCase())}
                onEnter={() => {}}
                getSuggestions={(q) => locationSuggestions(q)}
                quickPicks={LONDON_LOCATIONS}
                onQuickPick={(v) => set("location", v)}
                ariaLabel="Location"
                data-testid="input-location"
              />
              {!postcodeLooksValid && (
                <p
                  className="text-xs text-amber-600"
                  data-testid="postcode-hint"
                >
                  Tip: UK postcodes look like “E4 7ER” or “N1 9AL”. Borough or
                  city also fine.
                </p>
              )}
            </div>

            {/* Property type */}
            <div>
              <label
                htmlFor={ids.propertyType}
                className="text-xs text-slate-500"
              >
                Property type
              </label>
              <select
                id={ids.propertyType}
                name="propertyType"
                className="input"
                value={form.propertyType}
                onChange={(e) => set("propertyType", e.target.value)}
                required
                data-testid="select-property-type"
                aria-label="Property type"
              >
                <option value="" disabled>
                  Select property type
                </option>
                {PROPERTY_TYPES.map((pt) => (
                  <option key={pt} value={pt} data-testid={`option-${pt}`}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>

            {/* Bedrooms */}
            <div>
              <label htmlFor={ids.bedrooms} className="text-xs text-slate-500">
                Bedrooms
              </label>
              <input
                id={ids.bedrooms}
                name="bedrooms"
                className="input"
                placeholder="Bedrooms"
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) => set("bedrooms", e.target.value)}
                onKeyDown={handleEnter}
                required
                data-testid="input-bedrooms"
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor={ids.description}
                className="text-xs text-slate-500"
              >
                Description
              </label>
              <textarea
                id={ids.description}
                name="description"
                className="input min-h-32"
                placeholder="Rooms, scope, materials, timing, budget band, access constraints…"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                onKeyDown={handleEnter}
                required
                data-testid="textarea-description"
              />
            </div>

            {err && (
              <p className="text-red-600 text-sm" data-testid="form-error">
                {err}
              </p>
            )}

            <div className="flex gap-2">
              <button
                className="btn"
                disabled={busy}
                aria-busy={busy}
                data-testid="btn-save-changes"
                name="btn-save-changes"
              >
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
