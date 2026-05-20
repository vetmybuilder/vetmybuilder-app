import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import SiteHeader from "@/components/SiteHeader";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { useApi } from "@/utils/api";
import { getCoachingTips } from "@/utils/coachingTips";

import Step1Company, {
  type Step1Form,
} from "@/components/vendor-register/Step1Company";
import Step2Trades from "@/components/vendor-register/Step2Trades";
import Step3Offers from "@/components/vendor-register/Step3Offers";

import WizardTopBar from "@/components/wizard/WizardTopBar";
import WizardProgressBar from "@/components/wizard/WizardProgressBar";
import WizardNavBar from "@/components/wizard/WizardNavBar";

// Inline spinner SVG - same shape used by SwipePayGate / ReportModal /
// PushPrompt / CloseProjectModal so busy state reads the same across
// the app.
function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M4 12a8 8 0 018-8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}

import {
  normalizeAsUrl,
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeTikTok,
  normalizeX,
  normalizeYouTube,
} from "@/utils/socialLinks";
import {
  buildReviewLinksPayload,
  type ReviewPlatformId,
} from "@/utils/reviewLinks";
import type { ServiceArea } from "@/utils/serviceAreas";
import {
  addOutward,
  addBorough,
  removeAt,
  flattenServiceAreas,
} from "@/utils/serviceAreas";

type Step = 1 | 2 | 3;
import type { SupportingDoc } from "@/components/vendor-register/SupportingDocsField";
type Doc = SupportingDoc;

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
  review_links_json?: string | null;

  discount_min_percent?: number | null;
  discount_max_percent?: number | null;
  offers_discount?: number | null;
  warranty_months?: number | null;

  company_number?: string | null;
  ch_status?: string | null;

  photo_urls?: string[] | null;
  profile_picture_url?: string | null;

  supporting_docs_json?: string | null;
};

/** Parse supporting_docs_json from /api/tradesmen/me into a typed array. */
function parseSupportingDocs(raw: string | null | undefined): SupportingDoc[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d) => d && typeof d === "object" && typeof d.type === "string",
    );
  } catch {
    return [];
  }
}

type MeResponse = {
  role: "tradesman" | "user";
  profile: RawProfile | null;
};

type FormState = {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  serviceAreas: ServiceArea[];
  website: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
    x: string;
    youtube: string;
    linkedin: string;
  };
  reviewLinks: {
    trustpilot: string;
    bark: string;
    mybuilder: string;
    checkatrade: string;
    houzz: string;
    yell: string;
  };
  tradeTypes: string[];
  workPhotos: File[];
  discountMin: number;
  discountMax: number;
  warranty: "none" | "3m" | "6m" | "12m" | "24m+";
  docs: Doc[];
  companyNumber: string | null;
  chStatus: string | null;
  existingPhotoUrls: string[];
  profilePictureKey: string | null;
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
  // Cancellable handle for the post-save redirect timer. Without
  // tracking + clearing this on unmount, a stale router.replace can
  // fire after the page has already navigated and Next throws an
  // "Invariant: hard navigate to same URL" runtime error.
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  const [step, setStep] = useState<Step>(1);

  const [profile, setProfile] = useState<RawProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [areaQuery, setAreaQuery] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);

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
          setForm(null);
          return;
        }

        const p: RawProfile = data.profile;
        setProfile(p);

        const serviceAreas: ServiceArea[] = parseCsv(p.service_areas).map(
          (code): ServiceArea => ({ kind: "outward", code }),
        );
        const website = p.web_url || "";
        const socialsArray = parseSocials(p.social_links_json);

        const socials = splitSocials(socialsArray);

        // Hydrate review-platform links from the persisted JSON. Format:
        // [{ platform: 'trustpilot', url: '...' }, ...]
        const reviewLinksMap: FormState["reviewLinks"] = {
          trustpilot: "",
          bark: "",
          mybuilder: "",
          checkatrade: "",
          houzz: "",
          yell: "",
        };
        try {
          const parsed = JSON.parse(p.review_links_json || "[]");
          if (Array.isArray(parsed)) {
            for (const e of parsed) {
              if (
                e &&
                typeof e === "object" &&
                typeof e.platform === "string" &&
                typeof e.url === "string" &&
                e.platform in reviewLinksMap
              ) {
                (reviewLinksMap as Record<string, string>)[e.platform] = e.url;
              }
            }
          }
        } catch {
          /* swallow - default to empty */
        }

        const discountMin =
          Number(p.discount_min_percent ?? p.offers_discount ?? 0) || 0;
        const discountMax =
          Number(p.discount_max_percent ?? p.offers_discount ?? 0) || 0;

        const wMonths = Number(p.warranty_months ?? 0) || 0;
        const warranty: FormState["warranty"] =
          wMonths >= 24
            ? "24m+"
            : wMonths >= 12
            ? "12m"
            : wMonths >= 6
            ? "6m"
            : wMonths >= 3
            ? "3m"
            : "none";

        const existingPhotoUrls = Array.isArray(p.photo_urls)
          ? p.photo_urls
          : [];

        const savedPic =
          typeof p.profile_picture_url === "string"
            ? p.profile_picture_url
            : null;
        const profilePictureKey =
          savedPic && existingPhotoUrls.includes(savedPic) ? savedPic : null;

        const next: FormState = {
          companyName: p.company_name || "",
          contactName: p.contact_name || "",
          phone: p.phone || "",
          email: p.email || "",
          serviceAreas,
          website,
          socials,
          reviewLinks: reviewLinksMap,
          tradeTypes: parseCsv(p.trade_types),
          workPhotos: [],
          discountMin,
          discountMax,
          warranty,
          docs: parseSupportingDocs(p.supporting_docs_json),
          companyNumber: p.company_number || null,
          chStatus: p.ch_status || null,
          existingPhotoUrls,
          profilePictureKey,
        };

        setForm(next);
        setWebsiteInput(website);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          e?.response?.data?.error || e?.message || "Failed to load profile";
        setErr(msg);
        setProfile(null);
        setForm(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  const tips = useMemo(() => {
    if (!profile) return [];
    const socialsArray = parseSocials(profile.social_links_json);
    return getCoachingTips({
      photoCount: (profile.photo_urls?.length ?? 0),
      chStatus: (profile.ch_status as any) ?? null,
      warrantyMonths: profile.warranty_months ?? null,
      trades: parseCsv(profile.trade_types),
      serviceAreas: parseCsv(profile.service_areas),
      supportingDocCount: parseSupportingDocs(profile.supporting_docs_json).length,
      websiteUrl: profile.web_url ?? null,
      socialLinks: socialsArray,
      offersDiscount: !!profile.offers_discount,
    });
  }, [profile]);

  // ---- helpers (mirroring registration) ----
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const addServiceAreaOutward = (raw: string) => {
    if (!form) return;
    set("serviceAreas", addOutward(form.serviceAreas || [], raw));
  };
  const addServiceAreaBorough = (name: string, outwardCodes: string[]) => {
    if (!form) return;
    set("serviceAreas", addBorough(form.serviceAreas || [], name, outwardCodes));
  };
  const removeServiceAreaAt = (index: number) => {
    if (!form) return;
    set("serviceAreas", removeAt(form.serviceAreas || [], index));
  };

  // website single
  const commitWebsite = () => {
    const url = normalizeAsUrl(websiteInput);
    if (!url) return;
    set("website", url);
    setWebsiteInput(url);
  };
  const onWebsiteKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commitWebsite();
    }
  };
  const clearWebsite = () => {
    set("website", "");
    setWebsiteInput("");
  };

  // STEP handlers

  const onNextFromStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErr(null);
    setEmailErr(null);

    const errors: string[] = [];

    if (!form.companyName.trim()) {
      errors.push("Company name is required.");
    }
    if (!form.contactName.trim()) {
      errors.push("Contact name is required.");
    }
    if (!form.email.trim()) {
      errors.push("Business email is required.");
    }
    if (form.serviceAreas.length === 0) {
      errors.push("Please add at least one service area.");
    }

    if (errors.length) {
      setErr(errors.join("\n"));
      return;
    }

    setStep(2);
  };

  const onNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setStep(3);
  };

  const onSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setErr(null);
    setBusy(true);
    setOkMsg(null);

    try {
      const errors: string[] = [];

      if (!form.companyName.trim()) {
        errors.push("Company name is required.");
      }
      if (!form.email.trim()) {
        errors.push("Business email is required.");
      }

      if (errors.length) {
        setErr(errors.join("\n"));
        setBusy(false);
        return;
      }

      const socials = [
        normalizeInstagram(form.socials.instagram),
        normalizeTikTok(form.socials.tiktok),
        normalizeFacebook(form.socials.facebook),
        normalizeX(form.socials.x),
        normalizeYouTube(form.socials.youtube),
        normalizeLinkedIn(form.socials.linkedin),
      ].filter(Boolean);

      const warrantyMonths =
        form.warranty === "none"
          ? 0
          : form.warranty === "3m"
          ? 3
          : form.warranty === "6m"
          ? 6
          : form.warranty === "12m"
          ? 12
          : 24;

      // upload new photos, merge with existing URLs
      let photoUrls: string[] = [...form.existingPhotoUrls];
      const existingCount = form.existingPhotoUrls.length;
      try {
        if (form.workPhotos && form.workPhotos.length > 0) {
          const fd = new FormData();
          form.workPhotos.forEach((file) => fd.append("photos", file));

          const uploadRes = await api.post("/api/tradesmen/upload-photos", fd);
          const data = (uploadRes as any)?.data ?? uploadRes;
          if (data?.ok && Array.isArray(data.urls)) {
            photoUrls = [...photoUrls, ...data.urls];
          }
        }
      } catch {
        // soft-fail: keep existing photos
      }

      // Resolve profile picture key → URL
      let profilePictureUrl: string | null = null;
      if (form.profilePictureKey) {
        if (form.profilePictureKey.startsWith("new-")) {
          const idx = parseInt(form.profilePictureKey.slice(4), 10);
          profilePictureUrl = photoUrls[existingCount + idx] ?? null;
        } else {
          // key is the URL itself (existing photo)
          profilePictureUrl = form.profilePictureKey;
        }
      }

      const reviewLinks = buildReviewLinksPayload(
        (Object.keys(form.reviewLinks || {}) as ReviewPlatformId[]).map(
          (id) => ({ platform: id, url: form.reviewLinks?.[id] || "" }),
        ),
      );

      const payload = {
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone || null,
        email: form.email,
        tradeTypes: form.tradeTypes,
        serviceAreas: flattenServiceAreas(form.serviceAreas),
        website: form.website || "",
        socialLinks: socials,
        reviewLinks,
        photoCount: photoUrls.length,
        photoUrls,
        supportingDocCount: (form.docs || []).length,
        supportingDocs: form.docs || [],
        warrantyMonths,
        discountMinPercent: Math.max(0, Math.round(form.discountMin || 0)),
        discountMaxPercent: Math.max(0, Math.round(form.discountMax || 0)),
        offersDiscount: Math.max(form.discountMin || 0, form.discountMax || 0),
        companyNumber: form.companyNumber || null,
        chStatus: form.chStatus || null,
        profilePictureUrl,
      };

      const { data } = await api.put("/api/tradesmen/me", payload);
      if (!data?.ok) throw new Error(data?.error || "Failed to save profile");

      setOkMsg("Profile updated.");

      if (Array.isArray(data.profile?.photo_urls)) {
        setForm((prev) =>
          prev
            ? {
                ...prev,
                existingPhotoUrls: data.profile.photo_urls,
                workPhotos: [],
              }
            : prev
        );
      } else {
        setForm((prev) => (prev ? { ...prev, workPhotos: [] } : prev));
      }

      // Hold the success toast on screen for ~1.5s before bouncing to
      // the account hub. The save itself is fast, so without this delay
      // the "Profile updated" confirmation is barely visible before the
      // page changes. Stash the timer in a ref so the unmount cleanup
      // can cancel it - otherwise a stale router.replace fires after
      // navigation and Next throws "hard navigate to same URL".
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = setTimeout(() => {
        redirectTimerRef.current = null;
        // Don't push if we somehow ended up back on the same page
        // already (HMR / browser back).
        if (router.pathname !== "/tradesman/account") {
          router.replace("/tradesman/account");
        }
      }, 1500);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to save changes.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // Step 3 "Save" handler – just delegates to onSaveChanges
  const onSubmitStep3 = async (e: React.FormEvent) => {
    return onSaveChanges(e);
  };

  // ---- wizard nav helpers ----
  // Each step has a hidden <button type="submit"> inside its form.
  // WizardNavBar's onNext programmatically clicks it, which fires the
  // native form submit → the step handler above.
  const triggerStepSubmit = () => {
    const testId =
      step === 1 ? "btn-next"
      : step === 2 ? "btn-continue"
      : "btn-continue";
    const btn = document.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`
    );
    btn?.click();
  };

  const handleBack = () => {
    if (step === 1) {
      // /tradesman/account is the canonical parent of profile/edit, so
      // exiting at step 1 always lands there - regardless of which page
      // the user navigated in from. router.replace (not push) avoids
      // adding a redundant history entry.
      router.replace("/tradesman/account");
    } else {
      setStep((s) => (s - 1) as Step);
    }
  };

  const handleClose = () => {
    router.replace("/tradesman/account");
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <>
        {/* MOBILE loading - existing wizard chrome skeleton */}
        <main
          className="md:hidden fixed inset-0 bg-gray-50 flex flex-col"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          <div className="h-[env(safe-area-inset-top)]" />
          <WizardTopBar
            title="Edit profile"
            onBack={handleBack}
            onClose={handleClose}
          />
          <WizardProgressBar step={step} total={3} tone="emerald" />
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-zinc-400">Loading…</p>
          </div>
        </main>

        {/* DESKTOP loading - cream + watermark + SiteHeader so the old
            wizard chrome doesn't flash before the V3 layout takes over. */}
        <div className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden">
          <SiteHeader />
          <BrandWatermarkScatter />
          <div className="mx-auto max-w-3xl px-6 pb-12 relative z-10">
            <div className="text-center pt-6 pb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
                Edit profile
              </div>
              <h1
                className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
                style={{ fontFamily: "'Sora', sans-serif" }}
              >
                Polish how{" "}
                <span
                  className="text-emerald-600"
                  style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
                >
                  homeowners see you
                </span>
              </h1>
            </div>
            <div className="bg-white border border-amber-100 rounded-3xl shadow-sm flex items-center justify-center py-24">
              <span className="text-[14px] font-semibold text-emerald-600 animate-pulse">
                Loading your profile…
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!form || !profile) {
    return (
      <>
        {/* MOBILE error - existing wizard chrome */}
        <main
          className="md:hidden fixed inset-0 bg-gray-50 flex flex-col"
          style={{
            paddingBottom: "env(safe-area-inset-bottom)",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
          }}
        >
          <div className="h-[env(safe-area-inset-top)]" />
          <WizardTopBar
            title="Edit profile"
            onBack={handleBack}
            onClose={handleClose}
          />
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm text-rose-600">{err || "No trade profile found."}</p>
          </div>
        </main>

        {/* DESKTOP error - same V3 chrome so the old wizard never flashes */}
        <div className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden">
          <SiteHeader />
          <BrandWatermarkScatter />
          <div className="mx-auto max-w-3xl px-6 pb-12 relative z-10">
            <div className="text-center pt-6 pb-4">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
                Edit profile
              </div>
            </div>
            <div className="bg-white border border-rose-200 rounded-3xl shadow-sm px-6 py-8 text-center">
              <p className="text-[13.5px] text-rose-600 font-semibold">
                {err || "No trade profile found."}
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Edit profile • VetMyBuilder</title>
      </Head>

      {/* MOBILE — existing 3-step wizard, untouched. */}
      <main
        className="md:hidden fixed inset-0 bg-gray-50 flex flex-col"
        data-testid="trades-edit-profile-page"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <div className="h-[env(safe-area-inset-top)]" />

        <WizardTopBar
          title="Edit profile"
          onBack={handleBack}
          onClose={handleClose}
        />

        <WizardProgressBar step={step} total={3} tone="emerald" />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {err && (
            <p className="mx-3 mt-3 text-sm text-red-500 font-medium whitespace-pre-line" role="alert">
              {err}
            </p>
          )}

          {tips.length > 0 && step === 1 && (
            <div className="mx-3 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">
                Boost your profile — {tips.length} quick win{tips.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {tips.map((tip) => (
                  <li key={tip.key} className="flex items-start gap-2 text-sm text-amber-800">
                    <span className="mt-0.5 text-amber-500">•</span>
                    {tip.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <Step1Company
              form={form as unknown as Step1Form}
              set={(k, v) => {
                // we DO NOT allow changing companyName or email on edit
                if (k === "companyName" || k === "email") return;
                if (k === "email") setEmailErr(null);
                // Step1Form keys are subset of FormState
                // @ts-expect-error
                set(k, v);
              }}
              addServiceAreaOutward={addServiceAreaOutward}
              addServiceAreaBorough={addServiceAreaBorough}
              removeServiceAreaAt={removeServiceAreaAt}
              areaQuery={areaQuery}
              setAreaQuery={setAreaQuery}
              websiteInput={websiteInput}
              setWebsiteInput={setWebsiteInput}
              commitWebsite={commitWebsite}
              onWebsiteKey={onWebsiteKey}
              clearWebsite={clearWebsite}
              canProceed={true}
              onNext={onNextFromStep1}
              userIsAuthed={true}
              nextQuery={"?next=/tradesman/account"}
              errors={{ email: emailErr }}
              disableCompanyName
              disableBusinessEmail
            />
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <Step2Trades
              tradeTypes={form.tradeTypes}
              setTradeTypes={(v) => set("tradeTypes", v)}
              workPhotos={form.workPhotos}
              setWorkPhotos={(files) => set("workPhotos", files)}
              onBack={() => setStep(1)}
              onNext={onNextFromStep2}
              err={err || undefined}
              existingPhotoUrls={form.existingPhotoUrls}
              profilePictureKey={form.profilePictureKey}
              onProfilePictureKeyChange={(key) => set("profilePictureKey", key)}
              onRemoveExistingPhoto={(url) =>
                set(
                  "existingPhotoUrls",
                  form.existingPhotoUrls.filter((u) => u !== url)
                )
              }
            />
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <Step3Offers
              discountMin={form.discountMin}
              discountMax={form.discountMax}
              setDiscountMin={(v) => set("discountMin", v)}
              setDiscountMax={(v) => set("discountMax", v)}
              warranty={form.warranty}
              setWarranty={(v) => set("warranty", v)}
              docs={form.docs}
              onDocsChange={(docs) => set("docs", docs)}
              onBack={() => setStep(2)}
              onSaveDraft={onSubmitStep3}
              busy={busy}
              okMsg={okMsg || undefined}
              err={err || undefined}
              primaryLabel="Save changes"
            />
          )}

          <div className="h-4" />
        </div>

        <WizardNavBar
          onBack={step > 1 ? handleBack : undefined}
          onNext={triggerStepSubmit}
          nextLabel={step === 3 ? "Save changes" : "Next →"}
          busy={busy}
          tone="emerald"
        />
      </main>

      {/* DESKTOP — V3 single-page: cream + watermark + SiteHeader chrome,
          all three section forms visible at once, sticky save bar at the
          bottom. Same form state + save handler as the mobile wizard. */}
      <div
        className="hidden md:block min-h-screen bg-[#fef6e9] relative overflow-hidden"
        data-testid="trades-edit-profile-desktop"
      >
        <SiteHeader />
        <BrandWatermarkScatter />

        {/* Success toast - fixed top-center so it's hard to miss while
            the redirect to /tradesman/account is in flight. */}
        {okMsg && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600 text-white text-[13px] font-extrabold shadow-xl shadow-emerald-200"
            data-testid="profile-saved-toast"
          >
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/25 text-white text-[12px]">
              ✓
            </span>
            {okMsg}
          </div>
        )}

        <div className="mx-auto max-w-3xl px-6 pb-32 relative z-10">
          {/* Title */}
          <div className="text-center pt-6 pb-4">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 mb-0.5">
              Edit profile
            </div>
            <h1
              className="text-[26px] font-black tracking-tight text-slate-900 leading-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Polish how{" "}
              <span
                className="text-emerald-600"
                style={{ fontFamily: "'Caveat', cursive", fontSize: "120%" }}
              >
                homeowners see you
              </span>
            </h1>
          </div>

          {/* Coaching tips */}
          {tips.length > 0 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[12.5px] font-extrabold text-amber-900">
                Boost your profile - {tips.length} quick win{tips.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {tips.map((tip) => (
                  <li
                    key={tip.key}
                    className="flex items-start gap-2 text-[12px] text-amber-800"
                  >
                    <span className="text-amber-500">•</span>
                    {tip.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {err && (
            <p
              className="mb-4 text-[12.5px] text-red-600 font-semibold whitespace-pre-line bg-red-50 border border-red-200 rounded-xl px-4 py-3"
              role="alert"
            >
              {err}
            </p>
          )}

          {/* Section: Company */}
          <DesktopSection
            title="Company details"
            hint="The basics homeowners see when they open your profile."
          >
            <Step1Company
              form={form as unknown as Step1Form}
              set={(k, v) => {
                if (k === "companyName" || k === "email") return;
                if (k === "email") setEmailErr(null);
                // @ts-expect-error
                set(k, v);
              }}
              addServiceAreaOutward={addServiceAreaOutward}
              addServiceAreaBorough={addServiceAreaBorough}
              removeServiceAreaAt={removeServiceAreaAt}
              areaQuery={areaQuery}
              setAreaQuery={setAreaQuery}
              websiteInput={websiteInput}
              setWebsiteInput={setWebsiteInput}
              commitWebsite={commitWebsite}
              onWebsiteKey={onWebsiteKey}
              clearWebsite={clearWebsite}
              canProceed={true}
              onNext={(e) => e.preventDefault()}
              userIsAuthed={true}
              nextQuery={"?next=/tradesman/account"}
              errors={{ email: emailErr }}
              disableCompanyName
              disableBusinessEmail
            />
          </DesktopSection>

          {/* Section: Trades + Photos */}
          <DesktopSection
            title="Trades & photos"
            hint="Determine which jobs surface in your deck. The first photo is your profile picture."
          >
            <Step2Trades
              tradeTypes={form.tradeTypes}
              setTradeTypes={(v) => set("tradeTypes", v)}
              workPhotos={form.workPhotos}
              setWorkPhotos={(files) => set("workPhotos", files)}
              onBack={() => {}}
              onNext={(e) => e.preventDefault()}
              err={err || undefined}
              existingPhotoUrls={form.existingPhotoUrls}
              profilePictureKey={form.profilePictureKey}
              onProfilePictureKeyChange={(key) =>
                set("profilePictureKey", key)
              }
              onRemoveExistingPhoto={(url) =>
                set(
                  "existingPhotoUrls",
                  form.existingPhotoUrls.filter((u) => u !== url),
                )
              }
            />
          </DesktopSection>

          {/* Section: Offers + verification */}
          <DesktopSection
            title="Offers & documents"
            hint="Discounts, warranties and supporting docs."
          >
            <Step3Offers
              discountMin={form.discountMin}
              discountMax={form.discountMax}
              setDiscountMin={(v) => set("discountMin", v)}
              setDiscountMax={(v) => set("discountMax", v)}
              warranty={form.warranty}
              setWarranty={(v) => set("warranty", v)}
              docs={form.docs}
              onDocsChange={(docs) => set("docs", docs)}
              onBack={() => {}}
              onSaveDraft={(e) => e.preventDefault()}
              busy={busy}
              okMsg={okMsg || undefined}
              err={err || undefined}
              primaryLabel="Save changes"
            />
          </DesktopSection>

          {/* Success message is rendered as a fixed top-center toast at
              the top of this branch - no inline copy here. */}
        </div>

        {/* Sticky save bar - mirrors the V3 mock pattern */}
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-amber-100 py-3 px-6 z-40 hidden md:block">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            {/* Lock the bar while either the save is in flight (busy) OR
                the post-save success toast is showing (okMsg) - the
                redirect to /tradesman/account fires ~1.5s after busy
                flips false, so the user shouldn't be able to fire another
                save in that window. */}
            <button
              type="button"
              onClick={() => router.replace("/tradesman/account")}
              disabled={busy || !!okMsg}
              className="px-4 py-2 rounded-full text-[12.5px] font-extrabold text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={(e) => onSaveChanges(e as unknown as React.FormEvent)}
              disabled={busy || !!okMsg}
              className="inline-flex items-center justify-center gap-2 px-6 py-2 rounded-full text-[12.5px] font-extrabold text-white shadow-md shadow-emerald-200 hover:brightness-105 active:brightness-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all"
              style={{
                background: "linear-gradient(135deg,#10b981,#059669)",
              }}
              data-testid="desktop-save-changes"
            >
              {busy && <Spinner className="h-4 w-4" />}
              {busy ? "Saving…" : okMsg ? "Saved ✓" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function DesktopSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-amber-100 rounded-3xl p-5 shadow-sm mb-4">
      <h2
        className="text-[16px] font-black text-slate-900"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {title}
      </h2>
      <p className="mt-1 mb-3 text-[12px] text-slate-500">{hint}</p>
      {children}
    </section>
  );
}

/* ---------- helpers ---------- */

function parseCsv(val: unknown): string[] {
  return Array.isArray(val)
    ? val
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean)
    : typeof val === "string"
    ? val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function parseSocials(raw?: string | null): string[] {
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

function splitSocials(urls: string[]) {
  const pick = (pred: (u: string) => boolean) =>
    urls.find((u) => {
      try {
        const host = new URL(u).hostname.toLowerCase();
        return pred(host);
      } catch {
        return pred(u.toLowerCase());
      }
    }) || "";

  return {
    instagram: pick((h) => h.includes("instagram.com")),
    tiktok: pick((h) => h.includes("tiktok.com")),
    facebook: pick((h) => h.includes("facebook.com")),
    x: pick((h) => h.includes("twitter.com") || h.includes("x.com")),
    youtube: pick((h) => h.includes("youtube.com") || h.includes("youtu.be")),
    linkedin: pick((h) => h.includes("linkedin.com")),
  };
}
