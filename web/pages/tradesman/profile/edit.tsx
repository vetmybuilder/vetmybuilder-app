import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
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
type Doc = { name: string; size: number; type: string };

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
};

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
          docs: [],
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
      supportingDocCount: 0,
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

          console.log(
            "[profile/edit] uploaded work photos",
            form.workPhotos.length,
            "-> urls:",
            photoUrls.length
          );
        }
      } catch (uploadErr: any) {
        console.error(
          "[profile/edit] photo upload failed:",
          uploadErr?.message || uploadErr
        );
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

      setTimeout(() => {
        router.replace("/tradesman/account");
      }, 600);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error || e?.message || "Failed to save changes.";
      console.error("[profile/edit] save failed:", msg);
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
      // Pop the history entry so we land on whatever the user came from
      // (typically /tradesman/account). Avoids the account <-> edit loop
      // that router.push("/tradesman/account") used to create.
      router.back();
    } else {
      setStep((s) => (s - 1) as Step);
    }
  };

  const handleClose = () => {
    router.back();
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <main
        className="fixed inset-0 bg-gray-50 flex flex-col"
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
    );
  }

  if (!form || !profile) {
    return (
      <main
        className="fixed inset-0 bg-gray-50 flex flex-col"
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
    );
  }

  return (
    <>
      <Head>
        <title>Edit profile • VetMyBuilder</title>
      </Head>

      <main
        className="fixed inset-0 bg-gray-50 flex flex-col"
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
              onDocs={(e) => {
                const files = Array.from(e.target.files || []);
                const mapped: Doc[] = files.map((f) => ({
                  name: f.name,
                  size: f.size,
                  type: f.type || "application/octet-stream",
                }));
                set("docs", mapped);
              }}
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
    </>
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
