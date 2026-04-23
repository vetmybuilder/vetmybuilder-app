// web/pages/tradesman/register-tradesmen.tsx

import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { Check } from "lucide-react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import GuestOnly from "@/components/GuestOnly";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

import Step1Company, {
  type Step1Form,
} from "@/components/vendor-register/Step1Company";
import Step2Trades from "@/components/vendor-register/Step2Trades";
import Step3Offers from "@/components/vendor-register/Step3Offers";
import Step4Account from "@/components/vendor-register/Step4Account";

import type { ServiceArea } from "@/utils/serviceAreas";
import {
  addOutward,
  addBorough,
  removeAt,
  flattenServiceAreas,
} from "@/utils/serviceAreas";
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
import { ensureEmailAvailable } from "@/utils/email";
import { isStrongPassword } from "@/components/forms/PasswordChecklist";

const DRAFT_KEY = "vmb.vendorDraft.v3";
const REG_SENTINEL = "__vendor_registration_in_progress__";
const UK_PHONE = /^(?:\+44|0)[12378]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = 1 | 2 | 3 | 4;
type Doc = { name: string; size: number; type: string };

export default function TradesmanRegisterV2Page() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // IMPORTANT: while on this page, block global auth redirects
  useEffect(() => {
    try {
      sessionStorage.setItem("vmb:returnTo", REG_SENTINEL);
    } catch {}
    return () => {
      try {
        const v = sessionStorage.getItem("vmb:returnTo");
        if (v === REG_SENTINEL) sessionStorage.removeItem("vmb:returnTo");
      } catch {}
    };
  }, []);

  const [step, setStep] = useState<Step>(1);

  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    phone: "",
    email: "",
    serviceAreas: [] as ServiceArea[],
    website: "",
    socials: {
      instagram: "",
      tiktok: "",
      facebook: "",
      x: "",
      youtube: "",
      linkedin: "",
    },
    reviewLinks: {
      trustpilot: "",
      bark: "",
      mybuilder: "",
      checkatrade: "",
      houzz: "",
      yell: "",
    },
    tradeTypes: [] as string[],
    workPhotos: [] as File[], // File objects from uploader
    profilePictureKey: null as string | null, // "new-N" or null; not persisted across reload
    discountMin: 0,
    discountMax: 5,
    warranty: "none" as "none" | "3m" | "6m" | "12m" | "24m+",
    docs: [] as Doc[],
    // CH pre-check results
    companyNumber: null as string | null,
    chStatus: null as string | null,
    password: "",
    confirmPassword: "",
    betaCode: "",
  });

  const [betaRequired, setBetaRequired] = useState(false);
  const [betaCodeErr, setBetaCodeErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/api/auth/beta-status")
      .then((res) => setBetaRequired(!!res.data?.required))
      .catch(() => {});
  }, []); // eslint-disable-line

  const [areaQuery, setAreaQuery] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [step1Errors, setStep1Errors] = useState<Record<string, string | null>>({});

  // ---- persistence load ----
  const parseCsv = (val: unknown): string[] =>
    Array.isArray(val)
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

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) || {};

      setForm((p) => {
        // Avoid clobbering our File[] with old saved shapes
        // profilePictureKey "new-N" references files that are gone after reload — clear it
        const {
          workPhotos: _draftWorkPhotos,
          profilePictureKey: _draftPpKey,
          ...restDraft
        } = draft;

        return {
          ...p,
          ...restDraft,
          tradeTypes: parseCsv(restDraft.tradeTypes ?? p.tradeTypes),
          serviceAreas: Array.isArray(restDraft.serviceAreas)
            ? (restDraft.serviceAreas as unknown[])
                .map((item): ServiceArea | null => {
                  if (typeof item === "string") {
                    const code = item.trim().toUpperCase();
                    return code ? { kind: "outward", code } : null;
                  }
                  if (
                    item &&
                    typeof item === "object" &&
                    "kind" in item &&
                    ((item as any).kind === "outward" || (item as any).kind === "borough")
                  ) {
                    return item as ServiceArea;
                  }
                  return null;
                })
                .filter((x): x is ServiceArea => x !== null)
            : [],
          website:
            typeof restDraft.website === "string"
              ? restDraft.website
              : Array.isArray(restDraft.websites)
              ? restDraft.websites[0] || ""
              : p.website,
          socials: { ...p.socials, ...(restDraft.socials || {}) },
          reviewLinks: {
            ...p.reviewLinks,
            ...(restDraft.reviewLinks || {}),
          },
          // workPhotos intentionally NOT restored – Files can't be serialized
        };
      });

      setWebsiteInput(
        (prev) =>
          prev ||
          (typeof draft.website === "string"
            ? draft.website
            : Array.isArray(draft.websites)
            ? draft.websites[0] || ""
            : "")
      );
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
        const n = { ...p, [k]: v };
        persist(n);
        return n;
      });
    },
    [persist]
  );

  const setAndClear = useCallback(
    <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
      set(k, v);
      setStep1Errors((prev) =>
        prev[String(k)] ? { ...prev, [String(k)]: null } : prev,
      );
    },
    [set],
  );

  // ---- helpers ----
  const addServiceAreaOutward = (raw: string) => {
    set("serviceAreas", addOutward(form.serviceAreas || [], raw));
  };
  const addServiceAreaBorough = (name: string, outwardCodes: string[]) => {
    set("serviceAreas", addBorough(form.serviceAreas || [], name, outwardCodes));
  };
  const removeServiceAreaAt = (index: number) => {
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

  // keep discount bounds sane
  useEffect(() => {
    setForm((p) => {
      let { discountMin, discountMax } = p;
      discountMin = Math.max(0, Math.min(25, Math.round(discountMin)));
      discountMax = Math.max(0, Math.min(25, Math.round(discountMax)));
      if (discountMin > discountMax)
        [discountMin, discountMax] = [discountMax, discountMin];
      const n = { ...p, discountMin, discountMax };
      persist(n);
      return n;
    });
  }, [form.discountMin, form.discountMax]); // eslint-disable-line

  // ---- step handlers ----

  // STEP 1 -> 2
  const onNextFromStep1 = async (e: React.FormEvent) => {
    e.preventDefault();

    const next: Record<string, string | null> = {};
    if (!form.companyName.trim()) next.companyName = "Company name is required";
    if (!form.contactName.trim()) next.contactName = "Contact name is required";
    if (!form.email.trim()) next.email = "Business email is required";
    else if (!EMAIL_RE.test(form.email.trim()))
      next.email = "Enter a valid email address";
    const phone = form.phone.trim();
    if (phone) {
      const compact = phone.replace(/[\s\-()]/g, "");
      if (!UK_PHONE.test(compact))
        next.phone = "Enter a valid UK phone number (e.g. 07123 456789)";
    }
    if ((form.serviceAreas || []).length === 0)
      next.serviceAreas = "Add at least one service area";

    const hasAnyError = Object.values(next).some(Boolean);
    if (hasAnyError) {
      setStep1Errors(next);
      requestAnimationFrame(() => {
        const firstKey = Object.keys(next).find((k) => next[k]);
        if (!firstKey) return;
        const sel =
          firstKey === "serviceAreas"
            ? '[data-testid="input-areas"]'
            : `[data-testid="input-${firstKey.replace(/([A-Z])/g, "-$1").toLowerCase()}"]`;
        const el = document.querySelector(sel);
        if (el && "scrollIntoView" in el)
          (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    setStep1Errors({});
    setBetaCodeErr(null);

    try {
      await ensureEmailAvailable(
        api,
        form.email.trim(),
        betaRequired ? form.betaCode : undefined,
      );
      setStep(2);
    } catch (ex: any) {
      const errCode = ex?.response?.data?.error || ex?.message || "";
      if (errCode === "invalid_beta_code") {
        setBetaCodeErr("Invalid beta access code.");
      } else {
        setStep1Errors({ email: errCode || "Email already in use." });
      }
    }
  };

  // STEP 2 -> 3
  const onNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setStep(3);
  };

  // ===== Companies House pre-check (Step 3) =====
  const precheckCH = useCallback(async () => {
    try {
      const name = form.companyName?.trim();
      if (!name) return;
      const postcode = flattenServiceAreas(form.serviceAreas)[0] || "";
      const { data } = await api.post("/api/tradesmen/precheck", {
        name,
        postcode,
      });
      if (data?.ok) {
        const best = data.best || data.company;
        set("companyNumber", best?.number || null);
        set("chStatus", (data.verdict || best?.status || null) as any);
        if (best?.number) setOkMsg("Company verified with Companies House.");
      }
    } catch (e: any) {
      console.warn("[register-tradesmen] precheckCH failed:", e?.message || e);
    }
  }, [api, form.companyName, form.serviceAreas, set]); // eslint-disable-line

  // STEP 3 submit (runs CH + persist)
  const onSubmitStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);

    const socials = [
      normalizeInstagram(form.socials.instagram),
      normalizeTikTok(form.socials.tiktok),
      normalizeFacebook(form.socials.facebook),
      normalizeX(form.socials.x),
      normalizeYouTube(form.socials.youtube),
      normalizeLinkedIn(form.socials.linkedin),
    ].filter(Boolean) as string[];

    const websites = form.website ? [form.website] : [];

    const snapshot = {
      ...form,
      websites: Array.from(new Set([...websites, ...socials])),
    };

    // Persist the snapshot synchronously, then kick off the Companies
    // House precheck WITHOUT awaiting it. The server's PUT /api/tradesmen/me
    // (called from Step 4 / onCreateAccount) re-runs the same lookup
    // when companyNumber is empty, so we don't lose any data by not
    // blocking here. Awaiting was making the Step 3 → Step 4 transition
    // hang for >15s on mobile-webkit in CI when CH was slow.
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    } catch {}
    void precheckCH().then(() => setOkMsg("Saved."));
    setStep(4);
  };

  // STEP 4 create account (Firebase + backend + redirect)
  const onCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (!form.email.trim()) throw new Error("Business email is required.");
      if (!isStrongPassword(form.password))
        throw new Error(
          "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
        );
      if (form.password !== form.confirmPassword)
        throw new Error("Passwords do not match.");

      // 🔹 Ensure email isn't already taken (including aliases)
      await ensureEmailAvailable(
        api,
        form.email.trim(),
        betaRequired ? form.betaCode : undefined
      );

      // 1) Create Firebase user (this also logs them in)
      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );

      // 2) Force fresh ID token and send it explicitly
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken)
        throw new Error("Login token unavailable. Please try again.");

      // 3) Normalize socials
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

      // 4) Upload photos first (if any) to get persistent URLs
      let photoUrls: string[] = [];
      try {
        if (form.workPhotos && form.workPhotos.length > 0) {
          const fd = new FormData();
          form.workPhotos.forEach((file) => {
            fd.append("photos", file);
          });

          const uploadRes = await api.post("/api/tradesmen/upload-photos", fd, {
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "multipart/form-data",
            },
          });

          if (uploadRes.data?.ok && Array.isArray(uploadRes.data.urls)) {
            photoUrls = uploadRes.data.urls;
          }

        }
      } catch (uploadErr: any) {
        console.error(
          "[register-tradesmen] photo upload failed:",
          uploadErr?.message || uploadErr
        );
        // don't hard fail the whole registration on upload failure
      }

      // 5) Build payload matching /api/tradesmen/me expectations
      // Resolve profile picture key → URL
      let profilePictureUrl: string | null = null;
      if (form.profilePictureKey?.startsWith("new-")) {
        const idx = parseInt(form.profilePictureKey.slice(4), 10);
        profilePictureUrl = photoUrls[idx] ?? null;
      }

      // External-review payload: drops blank/invalid entries server-side too.
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
        photoCount: photoUrls.length || (form.workPhotos || []).length,
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

      // 6) Upsert vendor profile
      const { data } = await api.put("/api/tradesmen/me", payload, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!data?.ok) throw new Error(data?.error || "Failed to save profile");

      // 7) Cleanup + redirect
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      try {
        sessionStorage.setItem("vmb:returnTo", "/tradesman/projects");
      } catch {}

      // Prime the role cache for the upcoming full-page reload.
      //
      // Subtle race: SiteHeader's own /api/tradesmen/me GET fires earlier,
      // when the Firebase user first appears. On mobile-webkit that GET
      // can resolve AFTER the one below completes but BEFORE the page
      // actually unloads — its success handler writes back to
      // vmb:isTradesman, clobbering our "1" with the stale "0" it saw
      // pre-PUT. When the new page then reads the fast path, useRole
      // returns "user", TradesmanOnly bounces to /projects, and
      // AuthedOnly finishes the redirect to /signup/complete.
      //
      // Fix: also set a distinct one-shot flag that useRole consults
      // first. It survives SiteHeader's write because it's a different
      // key, and useRole clears it after honouring it.
      try {
        sessionStorage.setItem("vmb:justRegisteredTradesman", "1");
        sessionStorage.setItem("vmb:isTradesman", "1");
        const company = form.companyName;
        if (company) {
          sessionStorage.setItem("vmb:tradesCo", String(company));
        }
      } catch {}

      // Use Next's router.replace for the post-register redirect.
      // mobile-webkit has been observed to silently swallow
      // window.location changes made from the tail of an async handler
      // while the page is being unmounted by parent gates.
      try {
        if ("Notification" in window && !localStorage.getItem("vmb:pushSetupShown")) {
          sessionStorage.setItem("vmb:showPushPrompt", "1");
        }
      } catch {}
      router.replace("/tradesman/projects");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to create your account.";
      console.error("[register-tradesmen] create/save failed:", msg);
      setErr(msg);
      setBusy(false);
    }
  };

  const STEPS = [
    { id: 1 as Step, label: "Company & contact" },
    { id: 2 as Step, label: "Trades & photos" },
    { id: 3 as Step, label: "Offers & documents" },
    { id: 4 as Step, label: "Create account" },
  ];

  return (
    <GuestOnly>
      <>
      <Head>
        <title>Register as a Tradesperson — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-stone-50 -mt-14 pt-14">
        {/* Background bands */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col lg:flex-row" data-testid="trades-register-page">

          {/* ── Left sidebar ── */}
          <aside className="shrink-0 lg:sticky lg:top-0 lg:h-screen lg:w-72 xl:w-80 bg-white/85 backdrop-blur-sm border-b border-zinc-200 lg:border-b-0 lg:border-r lg:overflow-y-auto px-8 py-8 flex flex-col">
            <h1 className="text-2xl font-black text-zinc-900 mb-1.5">Join our network</h1>
            <p className="text-sm text-zinc-500 mb-10 leading-relaxed">
              Connect with homeowners looking for your services
            </p>

            {/* Vertical step indicator */}
            <nav aria-label="Registration steps">
              {STEPS.map((s, i) => {
                const done = step > s.id;
                const active = step === s.id;
                const isLast = i === STEPS.length - 1;
                return (
                  <div key={s.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                        done ? "border-red-500 bg-red-500 text-white" :
                        active ? "border-red-500 bg-white text-red-500" :
                        "border-zinc-300 bg-white text-zinc-400"
                      }`}>
                        {done ? <Check className="h-4 w-4" /> : s.id}
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 h-9 transition-colors ${done ? "bg-red-400" : "bg-zinc-200"}`} />
                      )}
                    </div>
                    <div className={`pt-1.5 ${!isLast ? "pb-9" : ""}`}>
                      <p className={`text-sm font-medium transition-colors ${
                        active ? "text-zinc-900" : done ? "text-zinc-500" : "text-zinc-300"
                      }`}>
                        {s.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* ── Right panel ── */}
          <div className="flex-1 px-6 py-10 lg:px-10 xl:px-16 lg:py-12">
            <div className="mx-auto max-w-2xl">
              {err && (
                <p className="mb-4 text-sm text-red-500 font-medium" role="alert">{err}</p>
              )}

        {step === 1 && (
          <Step1Company
            form={form as Step1Form}
            set={setAndClear as typeof set}
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
            userIsAuthed={!!user || !!authLoading}
            nextQuery={"?next=/tradesman/projects"}
            errors={step1Errors}
            betaRequired={betaRequired}
            betaCode={form.betaCode}
            setBetaCode={(v) => set("betaCode", v)}
            betaCodeError={betaCodeErr}
          />
        )}

        {step === 2 && (
          <Step2Trades
            tradeTypes={form.tradeTypes}
            setTradeTypes={(v) => set("tradeTypes", v)}
            workPhotos={form.workPhotos}
            setWorkPhotos={(files) => set("workPhotos", files)}
            onBack={() => setStep(1)}
            onNext={onNextFromStep2}
            err={err}
            existingPhotoUrls={[]}
            profilePictureKey={form.profilePictureKey}
            onProfilePictureKeyChange={(key) => set("profilePictureKey", key)}
          />
        )}

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
            okMsg={okMsg}
            err={err}
          />
        )}

        {step === 4 && (
          <Step4Account
            email={form.email}
            password={form.password}
            confirmPassword={form.confirmPassword}
            setPassword={(v) => set("password", v)}
            setConfirmPassword={(v) => set("confirmPassword", v)}
            onBack={() => setStep(3)}
            onCreate={onCreateAccount}
            busy={busy}
            err={err}
          />
        )}
            </div>
          </div>
        </div>
      </div>
      </>
    </GuestOnly>
  );
}
