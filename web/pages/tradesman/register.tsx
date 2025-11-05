import Head from "next/head";
import { useMemo, useEffect, useState, useCallback } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
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

const DRAFT_KEY = "vmb.vendorDraft.v3";
const REG_SENTINEL = "__vendor_registration_in_progress__";

type Step = 1 | 2 | 3 | 4;
type Doc = { name: string; size: number; type: string };

export default function TradesRegister() {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  // IMPORTANT: while on this page, block global auth redirects
  useEffect(() => {
    try {
      sessionStorage.setItem("vmb:returnTo", REG_SENTINEL);
      console.log("[register] set sentinel returnTo");
    } catch {}
    return () => {
      // clear the sentinel only if still set (avoid clobbering a deliberate value)
      try {
        const v = sessionStorage.getItem("vmb:returnTo");
        if (v === REG_SENTINEL) sessionStorage.removeItem("vmb:returnTo");
        console.log("[register] cleared sentinel on unmount");
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
    workPhotos: [] as Doc[],
    discountMin: 0,
    discountMax: 5,
    warranty: "none" as "none" | "3m" | "6m" | "12m" | "24m+",
    docs: [] as Doc[],
    // CH pre-check
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
      const draft = JSON.parse(raw);
      setForm((p) => ({
        ...p,
        ...draft,
        tradeTypes: parseCsv(draft.tradeTypes ?? p.tradeTypes),
        serviceAreas: parseCsv(draft.serviceAreas ?? p.serviceAreas),
        website:
          typeof draft.website === "string"
            ? draft.website
            : Array.isArray(draft.websites)
            ? draft.websites[0] || ""
            : p.website,
        socials: { ...p.socials, ...(draft.socials || {}) },
        workPhotos: Array.isArray(draft.workPhotos)
          ? draft.workPhotos
          : p.workPhotos,
      }));
      setWebsiteInput(
        (prev) =>
          prev || (typeof draft.website === "string" ? draft.website : "")
      );
      console.log("[register] draft loaded");
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

  // ---- email availability (Firebase Auth normalized) ----
  async function ensureEmailAvailable(email: string) {
    const { data } = await api.post("/api/auth/check-email", { email });
    if (data?.ok !== true) throw new Error(data?.error || "Email check failed");
    if (data?.exists || data?.existsNormalized)
      throw new Error(
        "An account with this email already exists (including aliases). Try signing in."
      );
  }

  // ---- step handlers ----
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
      await ensureEmailAvailable(form.email.trim());
      setStep(2);
    } catch (ex: any) {
      setEmailErr(
        ex?.response?.data?.error || ex?.message || "Email already in use."
      );
    }
  };

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
      console.log("[register] precheckCH", { name, postcode });
      const { data } = await api.post("/api/tradesmen/precheck", {
        name,
        postcode,
      });
      if (data?.ok) {
        const best = data.best || data.company;
        set("companyNumber", best?.number || null);
        set("chStatus", (data.verdict || best?.status || null) as any);
        if (best?.number) setOkMsg("Company verified with Companies House.");
        console.log("[register] precheckCH ok", {
          number: best?.number,
          verdict: data.verdict || best?.status,
        });
      } else {
        console.log("[register] precheckCH not ok", data);
      }
    } catch (e: any) {
      console.warn("[register] precheckCH failed:", e?.message || e);
    }
  }, [api, form.companyName, form.serviceAreas]); // eslint-disable-line

  // Step 3 now runs CH pre-check and persists locally
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
      console.log("[register] step3 saved snapshot");
    } catch {}
    setStep(4);
  };

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

      await ensureEmailAvailable(form.email.trim());

      // 1) Create Firebase user
      const auth = initFirebase();
      console.log("[register] step4 starting create account");
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email.trim(),
        form.password
      );
      console.log("[register] firebase user created", cred.user?.uid);

      // 2) Force fresh ID token and send it explicitly on the first PUT
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken)
        throw new Error("Login token unavailable. Please try again.");

      // 3) Build payload matching /api/tradesmen/me expectations
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

      const payload = {
        companyName: form.companyName,
        contactName: form.contactName,
        phone: form.phone || null,
        email: form.email,
        tradeTypes: form.tradeTypes,
        serviceAreas: form.serviceAreas,
        website: form.website || "",
        socialLinks: socials,
        photoCount: (form.workPhotos || []).length,
        supportingDocCount: (form.docs || []).length,
        warrantyMonths,
        discountMinPercent: Math.max(0, Math.round(form.discountMin || 0)),
        discountMaxPercent: Math.max(0, Math.round(form.discountMax || 0)),
        offersDiscount: Math.max(form.discountMin || 0, form.discountMax || 0),
        companyNumber: form.companyNumber || null, // from pre-check
        chStatus: form.chStatus || null, // from pre-check
      };

      // 4) Upsert vendor profile (explicit Bearer + correct API path)
      console.log("[register] calling PUT /api/tradesmen/me", payload);
      const { data } = await api.put("/api/tradesmen/me", payload, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!data?.ok) throw new Error(data?.error || "Failed to save profile");
      console.log("[register] PUT /api/tradesmen/me ok; saved profile");

      // 5) Cleanup + allow redirect and go
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      try {
        sessionStorage.setItem("vmb:returnTo", "/tradesman/projects"); // now safe to set a real target
      } catch {}
      window.location.replace("/tradesman/projects");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to create your account.";
      console.error("[register] create/save failed:", msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Head>
        <title>Join as a Tradesman • Vetmybuilder</title>
      </Head>

      <div
        className="mx-auto max-w-4xl px-6 py-6"
        data-testid="trades-register-page"
      >
        <h1 className="text-2xl font-semibold mb-1">Join as a Tradesman</h1>
        <p className="text-sm text-slate-600 mb-4">
          Fill in your details. The more compelling your profile, the more
          likely homeowners will choose you.
        </p>

        {/* Stepper */}
        <div className="mb-4">
          <ol className="flex flex-nowrap items-center gap-3 md:gap-4">
            {[
              { n: 1, label: "Company details" },
              { n: 2, label: "Trades & photos" },
              { n: 3, label: "Offers & documents" },
              { n: 4, label: "Create account" },
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
                {i < 3 && (
                  <span className="hidden md:inline text-slate-300">/</span>
                )}
              </li>
            ))}
          </ol>
        </div>

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
            onWorkPhotos={(e) => {
              const files = Array.from(e.target.files || []);
              const mapped: Doc[] = files.map((f) => ({
                name: f.name,
                size: f.size,
                type: f.type || "application/octet-stream",
              }));
              set("workPhotos", mapped);
            }}
            onBack={() => setStep(1)}
            onNext={onNextFromStep2}
            err={err}
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
    </>
  );
}
