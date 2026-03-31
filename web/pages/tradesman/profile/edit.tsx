import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";

import Step1Company, {
  type Step1Form,
} from "@/components/vendor-register/Step1Company";
import Step2Trades from "@/components/vendor-register/Step2Trades";
import Step3Offers from "@/components/vendor-register/Step3Offers";

import {
  normalizeAsUrl,
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeTikTok,
  normalizeX,
  normalizeYouTube,
} from "@/utils/socialLinks";

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
  serviceAreas: string[];
  website: string;
  socials: {
    instagram: string;
    tiktok: string;
    facebook: string;
    x: string;
    youtube: string;
    linkedin: string;
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

        const serviceAreas = parseCsv(p.service_areas);
        const website = p.web_url || "";
        const socialsArray = parseSocials(p.social_links_json);

        const socials = splitSocials(socialsArray);

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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!form || !profile) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <p className="text-sm text-rose-600">
          {err || "No trade profile found."}
        </p>
      </div>
    );
  }

  const title = form.companyName || "Edit profile";

  // simple setter helper
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  };

  const goToProfile = () => {
    router.push("/tradesman/profile");
  };

  // ---- helpers (mirroring registration) ----
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

      const payload = {
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone || null,
        email: form.email,
        tradeTypes: form.tradeTypes,
        serviceAreas: form.serviceAreas,
        website: form.website || "",
        socialLinks: socials,
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

      console.log("[profile/edit] PUT /api/tradesmen/me", {
        ...payload,
        photoUrlsCount: payload.photoUrls.length,
      });

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
        router.push("/tradesman/projects");
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

  // ===== RENDER =====

  return (
    <>
      <Head>
        <title>Edit profile • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-4xl px-6 py-6"
        data-testid="trades-edit-profile-page"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Edit profile</h1>
            <p className="text-sm text-slate-600 mb-1">
              Update the key details project owners will see.
            </p>
          </div>
          {/* Obvious cancel on all steps */}
          <button
            type="button"
            onClick={goToProfile}
            className="inline-flex items-center gap-2 rounded-full border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-rose-700 hover:bg-rose-100"
          >
            <span>Cancel without saving</span>
          </button>
        </div>

        {/* Stepper (clickable to jump between steps) */}
        <div className="mt-3 mb-4">
          <ol className="flex flex-nowrap items-center gap-3 md:gap-4">
            {[
              { n: 1 as Step, label: "Company details" },
              { n: 2 as Step, label: "Trades & photos" },
              { n: 3 as Step, label: "Offers & documents" },
            ].map(({ n, label }, i) => {
              const isActive = step === n;
              return (
                <li
                  key={n}
                  className="flex-none inline-flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setStep(n)}
                    className="inline-flex items-center gap-2 group"
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl font-medium ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                      }`}
                    >
                      {n}
                    </span>
                    <span
                      className={`hidden md:inline text-xs sm:text-sm ${
                        isActive
                          ? "font-medium text-slate-800"
                          : "text-slate-500 group-hover:text-slate-700"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                  {i < 2 && (
                    <span className="hidden md:inline text-slate-300">/</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {okMsg && (
          <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
            {okMsg}
          </div>
        )}

        {err && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 whitespace-pre-line">
            {err}
          </div>
        )}

        {/* STEP 1 – same component as registration, but company/email disabled */}
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
            addServiceArea={addServiceArea}
            removeServiceArea={removeServiceArea}
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
            nextQuery={"?next=/tradesman/projects"}
            emailError={emailErr}
            disableCompanyName
            disableBusinessEmail
          />
        )}

        {/* STEP 2 – trades & photos */}
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
          />
        )}

        {/* STEP 3 – offers & docs (final save happens here) */}
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
            primaryLabel="Save"
          />
        )}
      </div>
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
