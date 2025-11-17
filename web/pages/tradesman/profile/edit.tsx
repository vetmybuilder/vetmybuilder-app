// web/pages/tradesman/profile/edit.tsx
import { useEffect, useState, FormEvent } from "react";
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

  const [profile, setProfile] = useState<RawProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // form state (editable fields)
  const [trades, setTrades] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [offersDiscount, setOffersDiscount] = useState(false);
  const [discountMin, setDiscountMin] = useState<string>("");
  const [discountMax, setDiscountMax] = useState<string>("");
  const [warrantyMonths, setWarrantyMonths] = useState<string>("");

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
        setTrades(p.trade_types || "");
        setPhone(p.phone || "");
        setWebsite(p.web_url || "");

        const minPct = Number(p.discount_min_percent ?? 0) || 0;
        const maxPct = Number(p.discount_max_percent ?? 0) || 0;
        const hasDisc =
          Number(p.offers_discount ?? 0) > 0 || minPct > 0 || maxPct > 0;

        setOffersDiscount(hasDisc);
        setDiscountMin(minPct ? String(minPct) : "");
        setDiscountMax(maxPct ? String(maxPct) : "");

        const w = Number(p.warranty_months ?? 0) || 0;
        setWarrantyMonths(w ? String(w) : "");
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

  const onSubmit = async (e: FormEvent) => {
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

      const payload: any = {
        // required core fields (mostly from existing profile)
        companyName,
        contactName: profile.contact_name || null,
        phone: phone || null,
        email: profile.email || null,

        tradeTypes: trades, // comma-separated list – API will toCSV
        serviceAreas: profile.service_areas || "",

        website: website || null,
        socialLinks: parseSocials(profile.social_links_json),

        // discounts + warranty
        offersDiscount: offersDiscount
          ? Math.max(discountMinInt, discountMaxInt, 1)
          : 0,
        discountMinPercent: offersDiscount ? discountMinInt : 0,
        discountMaxPercent: offersDiscount ? discountMaxInt : 0,
        warrantyMonths: warrantyInt,

        // preserve existing photos (if backend exposes them)
        photoUrls: Array.isArray(profile.photo_urls)
          ? profile.photo_urls
          : undefined,
      };

      const res = await api.put("/api/tradesmen/me", payload);
      const data = (res as any)?.data ?? res;

      setFlash("Profile updated.");
      setTimeout(() => setFlash(null), 4000);

      if (data?.profile) {
        // keep local profile in sync
        setProfile((prev) => ({ ...(prev || {}), ...(data.profile as any) }));
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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (err && !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
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

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
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
        Update the key details project owners will see.
      </p>

      {flash && (
        <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
      >
        {/* read-only basics */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Company details
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
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
                Email
              </label>
              <input
                className="input bg-slate-50"
                value={profile.email || ""}
                disabled
                readOnly
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            To change your company name or email, please contact support or use
            the full registration flow.
          </p>
        </section>

        {/* trades offered */}
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

        {/* contact + website */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">
              Phone
            </label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 07123 456789"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-600">
              Website
            </label>
            <input
              className="input"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="e.g. https://yourcompany.co.uk"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Helps owners research you. We&apos;ll tidy the link automatically.
            </p>
          </div>
        </section>

        {/* discounts + warranty */}
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
            <label htmlFor="offers-discount" className="text-sm text-slate-700">
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
            Clear discounts and warranty help improve your VMB score.
          </p>
        </section>

        {/* photos note – keeps existing ones via photoUrls in payload */}
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">
            Project photos
          </h2>
          <p className="text-xs text-slate-500">
            Existing photos will be kept. To add or manage photos in bulk, use
            the main{" "}
            <button
              type="button"
              className="link text-indigo-600 underline-offset-2"
              onClick={() => router.push("/tradesman/register")}
            >
              registration flow
            </button>
            .
          </p>
        </section>

        {/* actions */}
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
            disabled={saving}
            className="h-9 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-900/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- helpers ---------- */

function safeInt(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function parseSocials(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    // ignore
  }
  return [];
}
