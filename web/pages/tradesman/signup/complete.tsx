// web/pages/tradesman/signup/complete.tsx
// Post-OAuth tradesman onboarding wizard.
//
// Reached by a Firebase-authed user whose OAuth flow declared
// `intent=tradesman` but who does not yet have a tradesmen row in MySQL.
//
// Uses the same Step1Company / Step2Trades / Step3Offers components as
// /tradesman/register-tradesmen so the UX is identical, but drops Step 4
// (password creation) — we already have a Firebase user from Google. Data
// we can read from the token (email, contact name) is pre-filled and
// disabled. On Step 3 submit we PUT /api/tradesmen/me and route to
// /tradesman/projects.

import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { Check } from "lucide-react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { initFirebase } from "@/utils/firebase";

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
import {
  buildReviewLinksPayload,
  type ReviewPlatformId,
} from "@/utils/reviewLinks";

// Keep the drafting key separate from the password-flow register page so
// a half-finished SSO signup doesn't collide with a half-finished
// email/password signup on the same device.
const DRAFT_KEY = "vmb.vendorDraftSso.v1";

type Step = 1 | 2 | 3;
type Doc = { name: string; size: number; type: string };

export default function TradesmanSsoOnboardingPage() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

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
    reviewLinks: {
      trustpilot: "",
      bark: "",
      mybuilder: "",
      checkatrade: "",
      houzz: "",
      yell: "",
    },
    tradeTypes: [] as string[],
    workPhotos: [] as File[],
    profilePictureKey: null as string | null,
    discountMin: 0,
    discountMax: 5,
    warranty: "none" as "none" | "3m" | "6m" | "12m" | "24m+",
    docs: [] as Doc[],
    companyNumber: null as string | null,
    chStatus: null as string | null,
    betaCode: "",
  });

  const [betaRequired, setBetaRequired] = useState(false);
  const [betaCodeErr, setBetaCodeErr] = useState<string | null>(null);

  const [areaQuery, setAreaQuery] = useState("");
  const [websiteInput, setWebsiteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);

  // Advertise to the rest of the app that this user is mid-way through a
  // tradesman signup. Route wrappers read this flag to avoid bouncing the
  // user to /signup/complete (the homeowner completion page) or to
  // /projects (homeowner dashboard) when they click around the site before
  // finishing. Cleared once PUT /api/tradesmen/me succeeds.
  //
  // Also clear vmb:oauthIntent here - it's a one-shot routing flag set
  // by OAuthSignInButton and consumed by login.tsx. Once we land here
  // it has done its job. Cleared in the destination (not in login.tsx)
  // to avoid a re-render race that overwrites the intended redirect.
  useEffect(() => {
    try {
      sessionStorage.setItem("vmb:tradesmanSignupInProgress", "1");
      sessionStorage.removeItem("vmb:oauthIntent");
    } catch {}
  }, []);

  // Redirect away if not signed in. If the user already has a tradesmen
  // row, bounce them to the dashboard instead of making them re-enter.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/tradesman/login");
      return;
    }

    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/api/tradesmen/me");
        if (!alive) return;
        const isTradesman =
          String(data?.role || "").toLowerCase() === "tradesman" ||
          !!data?.profile;
        if (isTradesman) {
          router.replace("/tradesman/projects");
          return;
        }
      } catch {
        // Non-fatal — user can still fill the form.
      } finally {
        if (alive) setHydrating(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, user, api, router]);

  // Is the beta gate active? Fetched on mount so the UI knows whether to
  // show the beta-code field on Step 1.
  useEffect(() => {
    api
      .get("/api/auth/beta-status")
      .then((res) => setBetaRequired(!!res.data?.required))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-fill email + contact name from the Firebase token. We leave the
  // fields in the form so users can edit the contact name, but disable
  // the email field — it's the identity we'll be talking to.
  useEffect(() => {
    if (!user) return;
    setForm((p) => {
      const googleEmail = user.email || "";
      const googleName = (user.displayName || "").trim();
      const nextEmail = p.email || googleEmail;
      const nextContact = p.contactName || googleName;
      if (nextEmail === p.email && nextContact === p.contactName) return p;
      return { ...p, email: nextEmail, contactName: nextContact };
    });
  }, [user]);

  // Draft persistence — lets users bail out and resume later on the
  // same device.
  const parseCsv = (val: unknown): string[] =>
    Array.isArray(val)
      ? val.map(String).map((s) => s.trim()).filter(Boolean)
      : typeof val === "string"
      ? val.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) || {};
      setForm((p) => {
        const {
          workPhotos: _workPhotos,
          profilePictureKey: _ppKey,
          ...rest
        } = draft;
        return {
          ...p,
          ...rest,
          tradeTypes: parseCsv(rest.tradeTypes ?? p.tradeTypes),
          serviceAreas: parseCsv(rest.serviceAreas ?? p.serviceAreas),
          website:
            typeof rest.website === "string"
              ? rest.website
              : Array.isArray(rest.websites)
              ? rest.websites[0] || ""
              : p.website,
          socials: { ...p.socials, ...(rest.socials || {}) },
          reviewLinks: {
            ...p.reviewLinks,
            ...(rest.reviewLinks || {}),
          },
        };
      });
      setWebsiteInput(
        (prev) =>
          prev ||
          (typeof draft.website === "string"
            ? draft.website
            : Array.isArray(draft.websites)
            ? draft.websites[0] || ""
            : ""),
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
    [persist],
  );

  // ---- helpers (mirror register-tradesmen.tsx) ----
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
      Array.from(new Set([...(form.serviceAreas || []), code])),
    );
  };

  const removeServiceArea = (code: string) =>
    set(
      "serviceAreas",
      (form.serviceAreas || []).filter((x) => x !== code),
    );

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

  // Clamp discount bounds, same as register-tradesmen.tsx.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.discountMin, form.discountMax]);

  // ---- step handlers ----
  const onNextFromStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBetaCodeErr(null);

    const hasBasics =
      form.companyName.trim() &&
      form.contactName.trim() &&
      form.serviceAreas.length > 0;
    if (!hasBasics) {
      setErr("Please complete all required fields before continuing.");
      return;
    }

    // Beta gate. We can't reuse ensureEmailAvailable here because the
    // Firebase user already exists (that's the point of the SSO flow) —
    // it would always trip the "account with this email already exists"
    // branch. Instead we hit /api/auth/check-email ourselves; the
    // endpoint validates the beta code BEFORE the email lookup, so a
    // 403 invalid_beta_code surfaces regardless of the user's existence.
    if (betaRequired) {
      const code = (form.betaCode || "").trim();
      if (!code) {
        setBetaCodeErr("Beta access code is required.");
        return;
      }
      try {
        await api.post("/api/auth/check-email", {
          email: user?.email || form.email,
          betaCode: code,
        });
      } catch (ex: any) {
        const errCode = ex?.response?.data?.error || "";
        if (errCode === "invalid_beta_code") {
          setBetaCodeErr("Invalid beta access code.");
          return;
        }
        // Any other error is non-fatal here — the definitive save path on
        // Step 3 will surface a real problem. Don't block Step 1 on a
        // transient network issue.
      }
    }

    setStep(2);
  };

  const onNextFromStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setStep(3);
  };

  // Step 3 submit: the terminal action in this flow. We skip the
  // password-creation step from register-tradesmen.tsx because the user
  // is already Firebase-authed via Google. No client-side Companies
  // House precheck here — PUT /api/tradesmen/me runs its own CH lookup
  // server-side, and keeping the check on the critical path made this
  // click occasionally wait 20s+ in CI.
  const onFinishSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    setBusy(true);

    try {
      const auth = initFirebase();
      const idToken = await auth.currentUser?.getIdToken(true);
      if (!idToken) {
        throw new Error("Your session has expired. Please sign in again.");
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

      // Upload photos to get persistent URLs before we PUT the profile.
      let photoUrls: string[] = [];
      try {
        if (form.workPhotos && form.workPhotos.length > 0) {
          const fd = new FormData();
          form.workPhotos.forEach((file) => {
            fd.append("photos", file);
          });
          const uploadRes = await api.post(
            "/api/tradesmen/upload-photos",
            fd,
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "multipart/form-data",
              },
            },
          );
          if (uploadRes.data?.ok && Array.isArray(uploadRes.data.urls)) {
            photoUrls = uploadRes.data.urls;
          }
        }
      } catch (uploadErr: any) {
        // Same tolerance as register-tradesmen.tsx — don't hard-fail the
        // whole signup on photo-upload failure.
        console.error(
          "[tradesman/signup/complete] photo upload failed:",
          uploadErr?.message || uploadErr,
        );
      }

      let profilePictureUrl: string | null = null;
      if (form.profilePictureKey?.startsWith("new-")) {
        const idx = parseInt(form.profilePictureKey.slice(4), 10);
        profilePictureUrl = photoUrls[idx] ?? null;
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
        email: form.email || user?.email || null,
        tradeTypes: form.tradeTypes,
        serviceAreas: form.serviceAreas,
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

      const { data } = await api.put("/api/tradesmen/me", payload, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!data?.ok) throw new Error(data?.error || "Failed to save profile");

      try {
        sessionStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem("vmb:tradesmanSignupInProgress");
      } catch {}

      // Prime the role cache so the next page doesn't race
      // /api/tradesmen/me and flash the homeowner chrome. Same one-shot
      // flag the register wizard uses.
      try {
        sessionStorage.setItem("vmb:justRegisteredTradesman", "1");
        sessionStorage.setItem("vmb:isTradesman", "1");
        if (form.companyName) {
          sessionStorage.setItem("vmb:tradesCo", form.companyName);
        }
      } catch {}

      router.replace("/tradesman/projects");
    } catch (ex: any) {
      const msg =
        ex?.response?.data?.error ||
        ex?.message ||
        "Failed to finish signing up.";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const STEPS: Array<{ id: Step; label: string }> = [
    { id: 1, label: "Company & contact" },
    { id: 2, label: "Trades & photos" },
    { id: 3, label: "Offers & documents" },
  ];

  if (authLoading || hydrating) return null;

  return (
    <>
      <Head>
        <title>Finish tradesperson signup — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-stone-50">
        {/* Background bands — lifted from register-tradesmen.tsx so the
            visual treatment matches. */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div
          className="relative z-10 flex min-h-screen flex-col lg:flex-row"
          data-testid="tradesman-signup-complete-page"
        >
          {/* Sidebar stepper */}
          <aside className="shrink-0 lg:sticky lg:top-0 lg:h-screen lg:w-72 xl:w-80 bg-white/85 backdrop-blur-sm border-b border-zinc-200 lg:border-b-0 lg:border-r lg:overflow-y-auto px-8 py-8 flex flex-col">
            <h1 className="text-2xl font-black text-zinc-900 mb-1.5">
              Finish signing up
            </h1>
            <p className="text-sm text-zinc-500 mb-10 leading-relaxed">
              We&apos;ve got your Google account — tell us about your business
              so homeowners can find you.
            </p>

            <nav aria-label="Registration steps">
              {STEPS.map((s, i) => {
                const done = step > s.id;
                const active = step === s.id;
                const isLast = i === STEPS.length - 1;
                return (
                  <div key={s.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                          done
                            ? "border-red-500 bg-red-500 text-white"
                            : active
                            ? "border-red-500 bg-white text-red-500"
                            : "border-zinc-300 bg-white text-zinc-400"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : s.id}
                      </div>
                      {!isLast && (
                        <div
                          className={`w-0.5 h-9 transition-colors ${
                            done ? "bg-red-400" : "bg-zinc-200"
                          }`}
                        />
                      )}
                    </div>
                    <div className={`pt-1.5 ${!isLast ? "pb-9" : ""}`}>
                      <p
                        className={`text-sm font-medium transition-colors ${
                          active
                            ? "text-zinc-900"
                            : done
                            ? "text-zinc-500"
                            : "text-zinc-300"
                        }`}
                      >
                        {s.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Right panel */}
          <div className="flex-1 px-6 py-10 lg:px-10 xl:px-16 lg:py-12">
            <div className="mx-auto max-w-2xl">
              {err && (
                <p
                  className="mb-4 text-sm text-red-500 font-medium"
                  role="alert"
                  data-testid="tradesman-signup-complete-error"
                >
                  {err}
                </p>
              )}

              {step === 1 && (
                <Step1Company
                  form={form as Step1Form}
                  set={(k, v) => {
                    if ((k as string) === "betaCode") setBetaCodeErr(null);
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
                  // We already know this email — it's the Firebase identity
                  // for this session, so we must not let the user change it.
                  disableBusinessEmail
                  emailError={null}
                  betaRequired={betaRequired}
                  betaCode={form.betaCode}
                  setBetaCode={(v) => {
                    setBetaCodeErr(null);
                    set("betaCode", v);
                  }}
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
                  onProfilePictureKeyChange={(key) =>
                    set("profilePictureKey", key)
                  }
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
                  onSaveDraft={onFinishSignup}
                  busy={busy}
                  okMsg={okMsg}
                  err={err}
                  primaryLabel="Finish sign up"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
