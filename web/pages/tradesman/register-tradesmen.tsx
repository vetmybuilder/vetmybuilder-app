// web/pages/tradesman/register-tradesmen.tsx

import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
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

import {
  normalizeAsUrl,
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeTikTok,
  normalizeX,
  normalizeYouTube,
} from "@/utils/socialLinks";
import { ensureEmailAvailable } from "@/utils/email";

const DRAFT_KEY = "vmb.vendorDraft.v3";
const REG_SENTINEL = "__vendor_registration_in_progress__";

type Step = 1 | 2 | 3 | 4;
type Doc = { name: string; size: number; type: string };

export default function TradesmanRegisterV2Page() {
  const api = useApi();
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
    serviceAreas: [] as string[],
    website: "",
    socials: {
      instagram: "",
      tiktok: "",
      facebook: "",
      x: "",
      youtube: "",
      linkedin: "",
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
  });

  const [areaQuery, setAreaQuery] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

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
          serviceAreas: parseCsv(restDraft.serviceAreas ?? p.serviceAreas),
          website:
            typeof restDraft.website === "string"
              ? restDraft.website
              : Array.isArray(restDraft.websites)
              ? restDraft.websites[0] || ""
              : p.website,
          socials: { ...p.socials, ...(restDraft.socials || {}) },
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

  // ---- helpers ----
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
    setErr(null);
    setEmailErr(null);

    const hasBasics =
      form.companyName.trim() &&
      form.contactName.trim() &&
      form.email.trim() &&
      form.serviceAreas.length > 0;

    if (!hasBasics) {
      setErr("Please complete all required fields before continuing.");
      return;
    }

    try {
      await ensureEmailAvailable(api, form.email.trim());
      setStep(2);
    } catch (ex: any) {
      setEmailErr(
        ex?.response?.data?.error || ex?.message || "Email already in use."
      );
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
      const postcode = form.serviceAreas?.[0] || "";
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

    try {
      await precheckCH();
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
      setOkMsg("Saved.");
    } catch {}
    setStep(4);
  };

  // STEP 4 create account (Firebase + backend + redirect)
  const onCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (!form.email.trim()) throw new Error("Business email is required.");
      if (form.password.length < 8)
        throw new Error("Password must be at least 8 characters.");
      if (form.password !== form.confirmPassword)
        throw new Error("Passwords do not match.");

      // 🔹 Ensure email isn't already taken (including aliases)
      await ensureEmailAvailable(api, form.email.trim());

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

      const payload = {
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone || null,
        email: form.email,
        tradeTypes: form.tradeTypes,
        serviceAreas: form.serviceAreas,
        website: form.website || "",
        socialLinks: socials,
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

      // User is already logged in via Firebase → just send them to dashboard
      window.location.replace("/tradesman/projects");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to create your account.";
      console.error("[register-tradesmen] create/save failed:", msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---- progress bar label ----
  const progress = (step / 4) * 100;
  const stepLabel =
    step === 1
      ? "Company & contact"
      : step === 2
      ? "Trades & photos"
      : step === 3
      ? "Offers & documents"
      : "Create account";

  return (
    <GuestOnly>
      <>
      <Head>
        <title>Register as a Tradesperson — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-stone-50">
        {/* Background bands */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

      <div
        className="relative z-10 mx-auto max-w-4xl px-6 py-8"
        data-testid="trades-register-page"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900">Register as a tradesperson</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Fill in your details. The more compelling your profile, the more
            likely homeowners will choose you.
          </p>
        </div>

        {/* Progress bar stepper */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 text-xs text-zinc-500">
            <span>Step {step} of 4</span>
            <span className="font-medium text-zinc-700">{stepLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {err && (
          <p className="mb-3 text-sm text-red-500 font-medium" role="alert">
            {err}
          </p>
        )}

        {step === 1 && (
          <Step1Company
            form={form as Step1Form}
            set={(k, v) => {
              if (k === "email") setEmailErr(null);
              set(k as any, v as any);
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
            userIsAuthed={!!user || !!authLoading}
            nextQuery={"?next=/tradesman/projects"}
            emailError={emailErr}
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
      </>
    </GuestOnly>
  );
}
