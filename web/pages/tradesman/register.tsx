// web/pages/tradesman/register.tsx
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import TradesCheckbox from "@/components/forms/TradesCheckbox";
import LocationField from "@/components/forms/LocationField";

const DRAFT_KEY = "vmb.vendorDraft.v3";

type Doc = { name: string; size: number; type: string };
type Step = 1 | 2 | 3 | 4;

export default function TradesRegister() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const here = useMemo(() => "/tradesman/register", []);
  const nextQuery = `?next=${encodeURIComponent(here)}`;

  useEffect(() => {
    try {
      sessionStorage.setItem("vmb:returnTo", here);
    } catch {}
  }, [here]);

  /* ---------------- Step state ---------------- */
  const [step, setStep] = useState<Step>(1);

  /* ---------------- Form state ---------------- */
  const [form, setForm] = useState({
    // section 1
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    serviceAreas: [] as string[], // outward sectors (E4, N17, …)
    websites: [] as string[], // multiple URLs
    // section 2
    tradeTypes: [] as string[], // checkbox selections
    workPhotos: [] as Doc[], // metadata for sample work images
    // section 3
    discountMin: 0,
    discountMax: 5,
    warranty: "none" as "none" | "3m" | "6m" | "12m" | "24m+",
    docs: [] as Doc[],
    // section 4
    password: "",
    confirmPassword: "",
  });

  // local query for LocationField (controlled)
  const [areaQuery, setAreaQuery] = useState("");
  // local input for Websites
  const [websiteInput, setWebsiteInput] = useState("");

  // helpers: CSV <-> array (for API compatibility)
  const toCsv = (arr: string[] | string) =>
    Array.isArray(arr) ? arr.join(",") : String(arr || "");
  const parseCsv = (val: unknown): string[] => {
    if (Array.isArray(val))
      return val.map((s) => String(s).trim()).filter(Boolean);
    if (typeof val === "string")
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return [];
  };

  // hydrate any draft (support old drafts)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      setForm((p) => ({
        ...p,
        ...draft,
        tradeTypes: parseCsv(draft.tradeTypes ?? p.tradeTypes),
        serviceAreas: parseCsv(draft.serviceAreas ?? p.serviceAreas),
        websites: Array.isArray(draft.websites)
          ? draft.websites
          : parseCsv(draft.websites ?? p.websites),
        workPhotos: Array.isArray(draft.workPhotos)
          ? draft.workPhotos
          : p.workPhotos,
      }));
    } catch {}
  }, []);

  const persist = useCallback((next: typeof form) => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const set = useCallback(
    <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
      setForm((p) => {
        const next = { ...p, [k]: v };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  /* ---------------- UI state ---------------- */
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  /* ---------------- Helpers ---------------- */
  const clampDiscounts = useCallback(() => {
    setForm((p) => {
      let { discountMin, discountMax } = p;
      discountMin = Math.max(0, Math.min(25, Math.round(discountMin)));
      discountMax = Math.max(0, Math.min(25, Math.round(discountMax)));
      if (discountMin > discountMax)
        [discountMin, discountMax] = [discountMax, discountMin];
      const next = { ...p, discountMin, discountMax };
      persist(next);
      return next;
    });
  }, [persist]);

  useEffect(clampDiscounts, [form.discountMin, form.discountMax]);

  // mandatory fields gate (Section 1)
  const canProceedStep1 =
    form.companyName.trim().length > 0 &&
    form.contactName.trim().length > 0 &&
    form.phone.trim().length > 0 &&
    form.serviceAreas.length > 0;

  /* ---------------- Postcode helpers ---------------- */
  function normalizeOutward(input: string): string {
    const v = (input || "").toUpperCase().trim();
    const m = v.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
    return m ? m[1] : v;
  }
  const addServiceArea = (raw: string) => {
    const code = normalizeOutward(raw);
    if (!code) return;
    set(
      "serviceAreas",
      Array.from(new Set([...(form.serviceAreas || []), code]))
    );
  };
  const removeServiceArea = (code: string) =>
    set(
      "serviceAreas",
      (form.serviceAreas || []).filter((x) => x !== code)
    );

  /* ---------------- Websites helpers ---------------- */
  function normalizeUrl(raw: string): string {
    let v = (raw || "").trim();
    if (!v) return "";
    // add scheme if missing
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    return v;
  }
  function isLikelyUrl(v: string): boolean {
    try {
      const u = new URL(v);
      return !!u.hostname && /\./.test(u.hostname);
    } catch {
      return false;
    }
  }
  const addWebsite = () => {
    const normalized = normalizeUrl(websiteInput);
    if (!normalized || !isLikelyUrl(normalized)) return;
    const next = Array.from(new Set([...(form.websites || []), normalized]));
    set("websites", next);
    setWebsiteInput("");
  };
  const removeWebsite = (url: string) =>
    set(
      "websites",
      (form.websites || []).filter((u) => u !== url)
    );

  /* ---------------- Work photos (Section 2) ---------------- */
  const onWorkPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const mapped: Doc[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    }));
    set("workPhotos", mapped);
  };

  /* ---------------- Docs (Section 3) ---------------- */
  const onDocs = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const mapped: Doc[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    }));
    set("docs", mapped);
  };

  /* ---------------- Step handlers ---------------- */
  const onNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!canProceedStep1) {
      setErr("Please complete all required fields before continuing.");
      return;
    }
    setStep(2);
  };

  const onNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setStep(3);
  };

  // Section 3 now does the save to /api/tradesmen/join
  const onSubmitStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    setBusy(true);
    try {
      const payload = {
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone,
        email: form.email,
        tradeTypes: toCsv(form.tradeTypes), // keep CSV for existing API
        serviceAreas: toCsv(form.serviceAreas), // keep CSV for existing API
        websites: form.websites, // array of URLs
        offer: {
          discountMin: form.discountMin,
          discountMax: form.discountMax,
          warranty: form.warranty,
        },
        docs: form.docs, // supporting docs meta
        workPhotos: form.workPhotos, // sample work meta (server may ignore for now)
        draft: true,
      };
      const { data, status } = await api.post("/api/tradesmen/join", payload);
      if (status >= 200 && status < 300 && data?.ok) {
        setOkMsg("Details saved.");
        setStep(4);
      } else {
        throw new Error(data?.error || "Failed to save");
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const onCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const email = form.email.trim();
      if (!email) throw new Error("Business email is required.");
      if (form.password.length < 8)
        throw new Error("Password must be at least 8 characters.");
      if (form.password !== form.confirmPassword)
        throw new Error("Passwords do not match.");

      const auth = initFirebase();
      await createUserWithEmailAndPassword(auth, email, form.password);

      try {
        await api.get("/api/tradesmen/me", {
          headers: { "Cache-Control": "no-store" },
        });
      } catch {}

      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      router.replace("/tradesman/projects");
      return;
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("auth/email-already-in-use")) {
        router.replace(
          `/login?next=${encodeURIComponent(
            "/tradesman/projects"
          )}&email=${encodeURIComponent(form.email.trim())}`
        );
        return;
      }
      setErr(
        e?.response?.data?.error ||
          msg ||
          "Failed to create your account. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- Warranty options ---------------- */
  const warrantyOptions: { key: typeof form.warranty; label: string }[] = [
    { key: "none", label: "No warranty" },
    { key: "3m", label: "3 months" },
    { key: "6m", label: "6 months" },
    { key: "12m", label: "1 year" },
    { key: "24m+", label: "2+ years" },
  ];

  return (
    <>
      <Head>
        <title>Join as a Tradesman • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-2xl px-4 py-4"
        data-testid="trades-register-page"
      >
        <h1 className="text-2xl font-semibold mb-1">Join as a Tradesman</h1>
        <p className="text-sm text-slate-600 mb-4">
          Fill in your details. The more compelling your profile, the more
          likely homeowners will choose you.
        </p>

        {/* Stepper (4 sections) */}
        <div
          className="mb-3 flex items-center gap-2 text-sm"
          data-testid="stepper"
        >
          <span
            className={`px-2 py-0.5 rounded ${
              step === 1 ? "bg-indigo-600 text-white" : "bg-slate-100"
            }`}
          >
            1
          </span>
          <span className={`${step === 1 ? "font-medium" : "text-slate-500"}`}>
            Company details
          </span>
          <span className="text-slate-400">/</span>

          <span
            className={`px-2 py-0.5 rounded ${
              step === 2 ? "bg-indigo-600 text-white" : "bg-slate-100"
            }`}
          >
            2
          </span>
          <span className={`${step === 2 ? "font-medium" : "text-slate-500"}`}>
            Trades & photos
          </span>
          <span className="text-slate-400">/</span>

          <span
            className={`px-2 py-0.5 rounded ${
              step === 3 ? "bg-indigo-600 text-white" : "bg-slate-100"
            }`}
          >
            3
          </span>
          <span className={`${step === 3 ? "font-medium" : "text-slate-500"}`}>
            Offers & documents
          </span>
          <span className="text-slate-400">/</span>

          <span
            className={`px-2 py-0.5 rounded ${
              step === 4 ? "bg-indigo-600 text-white" : "bg-slate-100"
            }`}
          >
            4
          </span>
          <span className={`${step === 4 ? "font-medium" : "text-slate-500"}`}>
            Create account
          </span>
        </div>

        {/* ===== Section 1 — Company details ===== */}
        {step === 1 && (
          <form
            className="card grid gap-3"
            onSubmit={onNextFromStep1}
            data-testid="step-1"
          >
            <label
              className="text-sm"
              htmlFor="companyName"
              data-testid="label-company-name"
            >
              Company name *
            </label>
            <input
              id="companyName"
              className="input"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder="Company Ltd"
              data-testid="input-company-name"
            />

            <label
              className="text-sm"
              htmlFor="contactName"
              data-testid="label-contact-name"
            >
              Contact name *
            </label>
            <input
              id="contactName"
              className="input"
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Your name"
              data-testid="input-contact-name"
            />

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label
                  className="text-sm"
                  htmlFor="phone"
                  data-testid="label-phone"
                >
                  Phone *
                </label>
                <input
                  id="phone"
                  className="input"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="020..."
                  data-testid="input-phone"
                />
              </div>
              <div>
                <label
                  className="text-sm"
                  htmlFor="email"
                  data-testid="label-email"
                >
                  Business email
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  data-testid="input-email"
                />
              </div>
            </div>

            {/* Service areas using LocationField (auto-add on commit; NO add button) */}
            <label className="text-sm" data-testid="label-areas">
              Service areas * (postcode sectors)
            </label>
            <div data-testid="input-areas">
              <LocationField
                placeholder="Type a postcode or place… e.g., E4, N17, Chingford"
                value={areaQuery}
                onChange={(val: string, meta?: any) => {
                  setAreaQuery(val || "");
                  if (meta) {
                    const token =
                      meta.outward || meta.sector || meta.postcode || "";
                    if (token) addServiceArea(token);
                    setAreaQuery("");
                  }
                }}
              />
              {form.serviceAreas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.serviceAreas.map((s) => (
                    <span key={s} className="badge">
                      {s}
                      <button
                        type="button"
                        className="ml-2 text-xs"
                        onClick={() => removeServiceArea(s)}
                        aria-label={`Remove ${s}`}
                        title="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-500">
                We use your postcode areas to match you with nearby homeowners.
                We never share your full address.
              </p>
            </div>

            {/* Websites (inline multi-URL) */}
            <div className="mt-2" data-testid="websites-field">
              <label className="text-sm">Websites</label>
              <div className="flex items-start gap-2 mt-1">
                <input
                  className="input flex-1"
                  placeholder="https://yourwebsite.com (or social/portfolio link)"
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addWebsite();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={addWebsite}
                  aria-label="Add website"
                >
                  + Add
                </button>
              </div>

              {form.websites.length > 0 && (
                <ul className="mt-3 grid gap-2" data-testid="websites-list">
                  {form.websites.map((u) => (
                    <li
                      key={u}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <a
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-sm link"
                      >
                        {u}
                      </a>
                      <button
                        type="button"
                        className="text-xs text-slate-500 hover:text-slate-700"
                        onClick={() => removeWebsite(u)}
                        aria-label={`Remove ${u}`}
                        title="Remove"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {err && (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="register-error"
              >
                {err}
              </p>
            )}

            <button
              className="btn"
              data-testid="btn-next"
              disabled={!canProceedStep1}
            >
              Next
            </button>

            {!user && !authLoading && (
              <p
                className="text-sm text-slate-600"
                data-testid="vendor-already-member"
              >
                Already a member?{" "}
                <Link
                  className="link"
                  href={`/login${nextQuery}`}
                  data-testid="link-vendor-signin"
                >
                  Sign in
                </Link>
              </p>
            )}
          </form>
        )}

        {/* ===== Section 2 — Trades & photos ===== */}
        {step === 2 && (
          <form
            className="card grid gap-4"
            onSubmit={onNextFromStep2}
            data-testid="step-2"
          >
            <div>
              <label className="text-sm" data-testid="label-trades">
                Trades
              </label>
              <TradesCheckbox
                value={form.tradeTypes}
                onChange={(next) => set("tradeTypes", next)}
                variant="grid"
                columns={4}
              />
            </div>

            <div data-testid="work-photos">
              <label className="text-sm font-medium block mb-1">
                Pictures of your work
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Adding recent photos helps you rank better and increases your
                chances of being hired.
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onWorkPhotos}
                className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:hover:bg-indigo-100"
              />
              {form.workPhotos.length > 0 && (
                <ul className="mt-2 text-sm text-slate-700 list-disc pl-5">
                  {form.workPhotos.map((d) => (
                    <li key={`${d.name}-${d.size}`}>{d.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(1)}
                data-testid="btn-back"
              >
                Back
              </button>
              <button className="btn" data-testid="btn-continue">
                Continue
              </button>
            </div>
          </form>
        )}

        {/* ===== Section 3 — Offers & documents (Saves draft) ===== */}
        {step === 3 && (
          <form
            className="card grid gap-4"
            onSubmit={onSubmitStep3}
            data-testid="step-3"
          >
            {/* Discount range */}
            <div data-testid="discount-range">
              <div className="flex items-end justify-between">
                <label className="text-sm font-medium">
                  Discount you can offer if hired
                </label>
                <span className="text-sm text-slate-600">
                  {form.discountMin}% – {form.discountMax}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Bigger discounts tend to win more work. Choose a realistic
                range.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500" htmlFor="discMin">
                    Min %
                  </label>
                  <input
                    id="discMin"
                    type="range"
                    min={0}
                    max={25}
                    value={form.discountMin}
                    onChange={(e) => set("discountMin", Number(e.target.value))}
                    className="w-full"
                    data-testid="input-discount-min"
                  />
                  <div className="text-xs text-slate-600 mt-1">
                    {form.discountMin}%
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500" htmlFor="discMax">
                    Max %
                  </label>
                  <input
                    id="discMax"
                    type="range"
                    min={0}
                    max={25}
                    value={form.discountMax}
                    onChange={(e) => set("discountMax", Number(e.target.value))}
                    className="w-full"
                    data-testid="input-discount-max"
                  />
                  <div className="text-xs text-slate-600 mt-1">
                    {form.discountMax}%
                  </div>
                </div>
              </div>
            </div>

            {/* Warranty pseudo-select */}
            <div data-testid="warranty-select">
              <label className="text-sm font-medium block mb-1">
                Warranty on your work
              </label>
              <div
                className="flex flex-wrap gap-2"
                role="listbox"
                aria-label="Warranty options"
              >
                {warrantyOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => set("warranty", opt.key)}
                    className={`px-3 py-1.5 rounded-xl text-sm ring-1 ${
                      form.warranty === opt.key
                        ? "bg-indigo-600 text-white ring-indigo-500"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    }`}
                    aria-pressed={form.warranty === opt.key}
                    data-testid={`warranty-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Supporting documents */}
            <div data-testid="supporting-docs">
              <label className="text-sm font-medium block mb-1">
                Supporting documents
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Upload insurance, memberships or certifications (optional). You
                can return to your profile later to add more.
              </p>
              <input
                type="file"
                multiple
                onChange={onDocs}
                className="block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-indigo-700 file:hover:bg-indigo-100"
                data-testid="input-docs"
              />
              {form.docs.length > 0 && (
                <ul
                  className="mt-2 text-sm text-slate-700 list-disc pl-5"
                  data-testid="docs-list"
                >
                  {form.docs.map((d) => (
                    <li key={`${d.name}-${d.size}`}>{d.name}</li>
                  ))}
                </ul>
              )}
            </div>

            {okMsg && (
              <p className="text-sm text-green-700" data-testid="join-ok">
                {okMsg}
              </p>
            )}
            {err && (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="join-error"
              >
                {err}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(2)}
                data-testid="btn-back"
              >
                Back
              </button>
              <button
                className="btn"
                disabled={busy}
                data-testid="btn-continue"
              >
                {busy ? "Saving…" : "Continue"}
              </button>
            </div>
          </form>
        )}

        {/* ===== Section 4 — Create account ===== */}
        {step === 4 && (
          <form
            className="card grid gap-3"
            onSubmit={onCreateAccount}
            data-testid="step-4"
          >
            <h2 className="text-lg font-medium">Create your account</h2>
            <p className="text-sm text-slate-600">
              Use the email{" "}
              <span className="font-medium">
                {form.email || "(missing email)"}
              </span>{" "}
              to sign in later.
            </p>

            <label
              className="text-sm"
              htmlFor="reg-pass"
              data-testid="label-password"
            >
              Password (min 8 chars)
            </label>
            <input
              id="reg-pass"
              name="password"
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="new-password"
              data-testid="input-password"
            />

            <label
              className="text-sm"
              htmlFor="reg-pass2"
              data-testid="label-password-2"
            >
              Confirm password
            </label>
            <input
              id="reg-pass2"
              name="confirmPassword"
              type="password"
              className="input"
              value={form.confirmPassword}
              onChange={(e) => set("confirmPassword", e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="new-password"
              data-testid="input-password-confirm"
            />

            {err && (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="create-error"
              >
                {err}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep(3)}
                data-testid="btn-back-2"
              >
                Back
              </button>
              <button
                className="btn"
                disabled={busy}
                data-testid="btn-create-account"
              >
                {busy ? "Creating…" : "Create account & continue"}
              </button>
            </div>

            <p
              className="text-sm text-slate-600"
              data-testid="vendor-already-member-3"
            >
              Already have an account?{" "}
              <Link
                className="link"
                href={`/login?next=${encodeURIComponent(
                  "/tradesman/projects"
                )}&email=${encodeURIComponent(form.email || "")}`}
                data-testid="link-vendor-signin-3"
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </>
  );
}
