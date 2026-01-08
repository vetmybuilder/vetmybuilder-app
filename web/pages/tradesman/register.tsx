// web/pages/tradesman/profile/edit.tsx
import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";

type RawProfile = {
  user_id?: string;
  uid?: string;
  id?: string;

  company_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;

  trade_types?: string | null;
  service_areas?: string | null;

  web_url?: string | null;
  social_links_json?: string | null;

  discount_min_percent?: number | null;
  discount_max_percent?: number | null;
  offers_discount?: number | null;
  warranty_months?: number | null;

  // optional from extended me.get
  photo_urls?: string[] | null;
};

type MeResponse = {
  role: "tradesman" | "user";
  profile: RawProfile | null;
};

type Step = 1 | 2 | 3;

export default function TradesmanProfileEditPage() {
  return (
    <AuthedOnly>
      <Inner />
    </AuthedOnly>
  );
}

function Inner() {
  const api = useApi();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);

  const [profile, setProfile] = useState<RawProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // form state (editable fields)
  const [contactName, setContactName] = useState("");
  const [trades, setTrades] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");

  const [offersDiscount, setOffersDiscount] = useState(false);
  const [discountMin, setDiscountMin] = useState<string>("");
  const [discountMax, setDiscountMax] = useState<string>("");
  const [warrantyMonths, setWarrantyMonths] = useState<string>("");

  // socials: one URL per line
  const [socialsText, setSocialsText] = useState("");

  // areas covered
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState("");

  // photos
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);

  // ---- load my profile from /api/tradesmen/me ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.get<MeResponse>("/api/tradesmen/me");
        const data = (res as any)?.data ?? res;

        if (cancelled) return;

        if (!data?.profile || data.role !== "tradesman") {
          setErr("No trade profile found.");
          setProfile(null);
          return;
        }

        const p: RawProfile = data.profile;
        setProfile(p);

        // seed form fields
        setContactName(p.contact_name || "");
        setTrades(p.trade_types || "");
        setPhone(p.phone || "");
        setWebsite(p.web_url || "");

        // discounts / warranty
        const minPct = Number(p.discount_min_percent ?? 0) || 0;
        const maxPct = Number(p.discount_max_percent ?? 0) || 0;
        const hasDisc =
          Number(p.offers_discount ?? 0) > 0 || minPct > 0 || maxPct > 0;

        setOffersDiscount(hasDisc);
        setDiscountMin(minPct ? String(minPct) : "");
        setDiscountMax(maxPct ? String(maxPct) : "");

        const w = Number(p.warranty_months ?? 0) || 0;
        setWarrantyMonths(w ? String(w) : "");

        // areas
        setServiceAreas(parseCsv(p.service_areas));

        // socials
        const socials = parseSocialsJson(p.social_links_json);
        setSocialsText(socials.join("\n"));

        // photos
        setExistingPhotoUrls(Array.isArray(p.photo_urls) ? p.photo_urls : []);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          e?.response?.data?.error || e?.message || "Failed to load profile";
        setErr(msg);
        setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const addServiceArea = () => {
    const code = normalizeOutward(areaInput);
    if (!code) return;
    setServiceAreas((curr) =>
      Array.from(new Set([...curr, code])).sort((a, b) => a.localeCompare(b))
    );
    setAreaInput("");
  };

  const onAreaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addServiceArea();
    }
  };

  const removeServiceArea = (code: string) => {
    setServiceAreas((curr) => curr.filter((c) => c !== code));
  };

  const onPhotosChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setNewPhotos((curr) => [...curr, ...files]);
    e.target.value = "";
  };

  const goNextFromStep1 = (e: FormEvent) => {
    e.preventDefault();
    // nothing mandatory to validate here – company name/email are read-only
    setStep(2);
  };

  const goNextFromStep2 = (e: FormEvent) => {
    e.preventDefault();
    // basic: ensure trades entered
    if (!trades.trim()) {
      setErr("Please enter at least one trade you offer.");
      return;
    }
    setErr(null);
    setStep(3);
  };

  const onSubmitFinal = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || saving) return;

    setSaving(true);
    setErr(null);
    setFlash(null);

    try {
      const companyName = (profile.company_name || "").trim();
      if (!companyName) {
        throw new Error(
          "Your company name is missing. Please complete your profile on the registration page first."
        );
      }

      const discountMinInt = safeInt(discountMin);
      const discountMaxInt = safeInt(discountMax);
      const warrantyInt = safeInt(warrantyMonths);

      // Social links: split on newlines and commas
      const socialLinks = socialsText
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);

      // Photos: upload any new photos and merge with existing URLs
      let photoUrls = [...existingPhotoUrls];

      if (newPhotos.length > 0) {
        const fd = new FormData();
        newPhotos.forEach((file) => {
          fd.append("photos", file);
        });

        try {
          const uploadRes = await api.post("/api/tradesmen/upload-photos", fd);
          const data = (uploadRes as any)?.data ?? uploadRes;
          if (data?.ok && Array.isArray(data.urls)) {
            photoUrls = [...photoUrls, ...data.urls];
          }
        } catch (uploadErr: any) {
          console.error(
            "[profile/edit] photo upload failed:",
            uploadErr?.message || uploadErr
          );
          // soft-fail: keep existing photos, just don't add new ones
        }
      }

      const payload: any = {
        // required core fields
        companyName,
        contactName: contactName || null,
        phone: phone || null,
        email: profile.email || null,

        // trades / areas
        tradeTypes: trades, // comma-separated – backend will normalise
        serviceAreas: serviceAreas, // array ok for me.put

        // web + socials
        website: website || null,
        socialLinks,

        // discounts + warranty
        offersDiscount: offersDiscount
          ? Math.max(discountMinInt, discountMaxInt, 1)
          : 0,
        discountMinPercent: offersDiscount ? discountMinInt : 0,
        discountMaxPercent: offersDiscount ? discountMaxInt : 0,
        warrantyMonths: warrantyInt,

        // photos
        photoUrls,
      };

      const res = await api.put("/api/tradesmen/me", payload);
      const data = (res as any)?.data ?? res;

      setFlash("Profile updated.");
      setTimeout(() => setFlash(null), 4000);

      if (data?.profile) {
        setProfile((prev) => ({ ...(prev || {}), ...(data.profile as any) }));
        setExistingPhotoUrls(photoUrls);
        setNewPhotos([]);
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to save changes. Please try again.";
      setErr(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (err && !profile) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          ← Back
        </button>
        <p className="text-sm text-rose-600">{err}</p>
      </div>
    );
  }

  if (!profile) return null;

  const title = profile.company_name || "Edit profile";
  const photosTotal = existingPhotoUrls.length + newPhotos.length;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-3 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        ← Back to profile
      </button>

      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">
        Edit profile
      </h1>
      <p className="text-sm text-slate-600 mb-4">
        Use the steps below to update your trade profile. Some core details are
        locked and can only be changed via support.
      </p>

      {/* Stepper – styled like registration, but 3 steps */}
      <div className="mb-5">
        <ol className="flex flex-nowrap items-center gap-3 md:gap-4">
          {[
            { n: 1 as Step, label: "Company details" },
            { n: 2 as Step, label: "Trades & photos" },
            { n: 3 as Step, label: "Offers & areas" },
          ].map(({ n, label }, i) => (
            <li key={n} className="flex-none inline-flex items-center gap-2">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl font-medium ${
                  step === n
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700"
                }`}
                aria-current={step === n ? "step" : undefined}
              >
                {n}
              </span>
              <span
                className={`hidden md:inline ${
                  step === n ? "font-medium text-slate-800" : "text-slate-500"
                }`}
              >
                {label}
              </span>
              {i < 2 && (
                <span className="hidden md:inline text-slate-300">/</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {flash && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </div>
      )}

      {err && profile && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* STEP 1: company details (same vibe as register Step1, with locked fields) */}
      {step === 1 && (
        <form
          onSubmit={goNextFromStep1}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              Company details
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">
                  Company name
                </label>
                <input
                  className="input bg-slate-50"
                  value={title}
                  disabled
                  readOnly
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">
                  Contact name
                </label>
                <input
                  className="input"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </div>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">
                  Email
                </label>
                <input
                  className="input bg-slate-50"
                  value={profile.email || ""}
                  disabled
                  readOnly
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">
                  Phone
                </label>
                <input
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 07123 456789"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              To change your company name or email, please contact support or
              complete the full registration flow again.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Website &amp; social media
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Website
                </label>
                <input
                  className="input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="e.g. https://yourcompany.co.uk"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Helps owners research you. We&apos;ll tidy the link
                  automatically.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Social links
                </label>
                <textarea
                  className="input min-h-[80px]"
                  value={socialsText}
                  onChange={(e) => setSocialsText(e.target.value)}
                  placeholder={
                    "One URL per line\nhttps://instagram.com/...\nhttps://facebook.com/..."
                  }
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Add any social profiles homeowners can use to see your work.
                </p>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-9 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-900/90"
            >
              Next
            </button>
          </div>
        </form>
      )}

      {/* STEP 2: trades + photos (like register Step2) */}
      {step === 2 && (
        <form
          onSubmit={goNextFromStep2}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Trades offered
            </h2>
            <p className="text-xs text-slate-500 mb-2">
              List the trades you cover, separated by commas. Example:{" "}
              <span className="font-mono">
                Bathroom Fitter, Kitchen Fitter, Plasterer
              </span>
              .
            </p>
            <textarea
              className="input min-h-[80px]"
              value={trades}
              onChange={(e) => setTrades(e.target.value)}
              placeholder="e.g. Bathroom Fitter, Kitchen Fitter, Plasterer"
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Project photos
            </h2>
            <p className="text-xs text-slate-500 mb-2">
              Add more photos to showcase your work. Existing photos will be
              kept.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer text-xs font-medium text-slate-700">
                  <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 hover:bg-slate-100">
                    Choose photos…
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={onPhotosChange}
                  />
                </label>
                <span className="text-xs text-slate-500">
                  {photosTotal} photo{photosTotal === 1 ? "" : "s"} selected
                  {existingPhotoUrls.length > 0
                    ? ` (${existingPhotoUrls.length} already live)`
                    : ""}
                </span>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-9 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="submit"
              className="h-9 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-900/90"
            >
              Next
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: offers + areas (mix of register Step3 + areas UI) */}
      {step === 3 && (
        <form
          onSubmit={onSubmitFinal}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm"
        >
          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Discounts &amp; warranty
            </h2>
            <div className="flex items-center gap-2 mb-3">
              <input
                id="offers-discount"
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={offersDiscount}
                onChange={(e) => setOffersDiscount(e.target.checked)}
              />
              <label
                htmlFor="offers-discount"
                className="text-sm text-slate-700"
              >
                I offer discounts to VetMyBuilder customers
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Min discount (%)
                </label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={discountMin}
                  onChange={(e) => setDiscountMin(e.target.value)}
                  disabled={!offersDiscount}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Max discount (%)
                </label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={discountMax}
                  onChange={(e) => setDiscountMax(e.target.value)}
                  disabled={!offersDiscount}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">
                  Warranty (months)
                </label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                  placeholder="e.g. 12"
                />
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Clear discounts and warranty details help improve your VMB score.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              Areas covered
            </h2>
            <p className="text-xs text-slate-500 mb-2">
              Add the postcode outward areas you cover. Example: E4, E17, IG8.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                className="input"
                placeholder="e.g. E4"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={onAreaKeyDown}
              />
              <button
                type="button"
                onClick={addServiceArea}
                className="rounded-full bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-900/90"
              >
                Add
              </button>
            </div>
            {serviceAreas.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {serviceAreas.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {code}
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600"
                      onClick={() => removeServiceArea(code)}
                      aria-label={`Remove ${code}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 mt-1">
                No areas set yet.
              </p>
            )}
          </section>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-9 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-9 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-900/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function safeInt(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function parseCsv(raw?: string | null): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/[,;|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSocialsJson(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // ignore
  }
  return [];
}

function normalizeOutward(input: string): string {
  const v = (input || "").toUpperCase().trim();
  const m = v.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return m ? m[1] : v;
}
