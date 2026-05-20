// web/pages/tradesman/signup/complete.tsx
// Post-OAuth tradesman onboarding wizard.
//
// Reached by a Firebase-authed user whose OAuth flow declared
// `intent=tradesman` but who does not yet have a tradesmen row in MySQL.
//
// Uses the same Step1Company / Step2Trades / Step3Offers components as
// /tradesman/register-tradesmen so the UX is identical, but drops Step 4
// (password creation) - we already have a Firebase user from Google. Data
// we can read from the token (email, contact name) is pre-filled and
// disabled. On Step 3 submit we PUT /api/tradesmen/me and route to
// /tradesman/jobs.

import Head from "next/head";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth, signOutUser } from "@/utils/auth";
import { initFirebase } from "@/utils/firebase";

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

// Keep the drafting key separate from the password-flow register page so
// a half-finished SSO signup doesn't collide with a half-finished
// email/password signup on the same device.
const DRAFT_KEY = "vmb.vendorDraftSso.v1";
const UK_PHONE = /^(?:\+44|0)[12378]\d{9}$/;

type Step = 1 | 2 | 3;
import type { SupportingDoc } from "@/components/vendor-register/SupportingDocsField";
type Doc = SupportingDoc;

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
  const [step1Errors, setStep1Errors] = useState<Record<string, string | null>>(
    {},
  );
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
          router.replace("/tradesman/jobs");
          return;
        }
      } catch {
        // Non-fatal
      } finally {
        if (alive) setHydrating(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, user, api, router]);

  // Is the beta gate active? Fetched on mount so the UI knows whether to
  // show the beta-code field on Step 1. Trader signups are not gated
  // pre-launch so this should always come back required:false.
  useEffect(() => {
    api
      .get("/api/auth/beta-status?role=trader")
      .then((res) => setBetaRequired(!!res.data?.required))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stamp the trader intent as soon as we have an authed user. Before
  // this, mid-signup users showed up in /admin as homeowners by
  // default (admin's fallback when no user_roles row exists). The
  // role-intent ping fills in user_roles so admin labels them
  // "tradesman (pending)".
  useEffect(() => {
    if (authLoading || !user) return;
    api
      .post("/api/auth/role-intent", { role: "tradesman" })
      .catch(() => {});
  }, [user, authLoading, api]);

  // Pre-fill email + contact name from the Firebase token. We leave the
  // fields in the form so users can edit the contact name, but disable
  // the email field - it's the identity we'll be talking to.
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

  // Draft persistence - lets users bail out and resume later on the
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
          serviceAreas: Array.isArray(rest.serviceAreas)
            ? (rest.serviceAreas as unknown[])
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

  // Clears the per-field step-1 error for the field being edited so the
  // inline red border disappears as the user fixes the value.
  const setAndClear = useCallback(
    <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
      set(k, v);
      setStep1Errors((prev) =>
        prev[String(k)] ? { ...prev, [String(k)]: null } : prev,
      );
    },
    [set],
  );

  // ---- helpers (mirror register-tradesmen.tsx) ----
  const addServiceAreaOutward = (raw: string) => {
    set("serviceAreas", addOutward(form.serviceAreas || [], raw));
  };
  const addServiceAreaBorough = (name: string, outwardCodes: string[]) => {
    set("serviceAreas", addBorough(form.serviceAreas || [], name, outwardCodes));
  };
  const removeServiceAreaAt = (index: number) => {
    set("serviceAreas", removeAt(form.serviceAreas || [], index));
  };

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

    const next: Record<string, string | null> = {};
    if (!form.companyName.trim())
      next.companyName = "Company name is required";
    if (!form.contactName.trim())
      next.contactName = "Contact name is required";
    const phone = form.phone.trim();
    if (phone) {
      const compact = phone.replace(/[\s\-()]/g, "");
      if (!UK_PHONE.test(compact))
        next.phone = "Enter a valid UK phone number (e.g. 07123 456789)";
    }
    if ((form.serviceAreas || []).length === 0)
      next.serviceAreas = "Add at least one service area";

    if (Object.values(next).some(Boolean)) {
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
          (el as HTMLElement).scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      });
      return;
    }
    setStep1Errors({});

    // Beta gate. We can't reuse ensureEmailAvailable here because the
    // Firebase user already exists (that's the point of the SSO flow) -
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
          role: "trader",
        });
      } catch (ex: any) {
        const errCode = ex?.response?.data?.error || "";
        if (errCode === "invalid_beta_code") {
          setBetaCodeErr("Invalid beta access code.");
          return;
        }
        // Any other error is non-fatal here - the definitive save path on
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
  // House precheck here - PUT /api/tradesmen/me runs its own CH lookup
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
      } catch {
        // Same tolerance as register-tradesmen.tsx - don't hard-fail the
        // whole signup on photo-upload failure.
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
        serviceAreas: flattenServiceAreas(form.serviceAreas),
        website: form.website || "",
        socialLinks: socials,
        reviewLinks,
        photoCount: photoUrls.length || (form.workPhotos || []).length,
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

      try {
        if ("Notification" in window && !localStorage.getItem("vmb:pushSetupShown")) {
          sessionStorage.setItem("vmb:showPushPrompt", "1");
        }
      } catch {}
      router.replace("/tradesman/jobs");
    } catch (ex: any) {
      const msg =
        ex?.response?.data?.error ||
        ex?.message ||
        "Failed to finish signing up.";
      setErr(msg);
      setBusy(false);
    }
  };

  // ---- wizard nav helpers ----
  // Each step has a hidden <button type="submit"> inside its form.
  // WizardNavBar's onNext programmatically clicks it, which fires the
  // native form submit -> the step handler above.
  const triggerStepSubmit = () => {
    const testId =
      step === 1 ? "btn-next" : "btn-continue";
    const btn = document.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    btn?.click();
  };

  const handleBack = async () => {
    if (step === 1) {
      // Step 1 back exits the SSO flow entirely. Sign the user out (their
      // Firebase identity is the only artefact created so far) and bounce
      // back to /login so they can pick a different account or method.
      try {
        sessionStorage.removeItem("vmb:tradesmanSignupInProgress");
      } catch {}
      try {
        await signOutUser();
      } catch {}
      router.push("/login");
    } else {
      setStep((s) => (s - 1) as Step);
    }
  };

  const handleClose = () => {
    router.push("/");
  };

  if (authLoading || hydrating) return null;

  // Note: we used to block here when profileComplete=true on the
  // assumption that "user row exists = homeowner". Since dropping the
  // postcode requirement at signup, profileComplete is true for any
  // signed-in user (touchUserMw auto-creates the user row from the
  // Firebase token on first authed request). The tradesman case is
  // already handled above (redirect to /tradesman/jobs); everyone else
  // is a brand-new OAuth user who's allowed to register as a trade.

  return (
    <>
      <Head>
        <title>Finish tradesperson signup - VetMyBuilder</title>
        <style>{`body { background: #ffffff !important; }`}</style>
      </Head>

      <main
        className="fixed inset-0 bg-gray-100 flex flex-col"
        data-testid="tradesman-signup-complete-page"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <div className="h-[env(safe-area-inset-top)]" />

        {/* Mobile: edge-to-edge column. Desktop: centred card with chrome. */}
        <div className="w-full md:max-w-2xl mx-auto flex-1 flex flex-col min-h-0 bg-gray-50 md:my-6 md:rounded-2xl md:shadow-lg md:overflow-hidden md:border md:border-gray-200">

        <WizardTopBar
          title="Trade sign-up"
          onBack={handleBack}
          onClose={handleClose}
        />

        <WizardProgressBar step={step} total={3} tone="emerald" />

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {err && (
            <p
              className="mx-3 mt-3 text-sm text-red-500 font-medium"
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
                setAndClear(k as any, v as any);
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
              userIsAuthed={!!user || !!authLoading}
              nextQuery={"?next=/tradesman/jobs"}
              // We already know this email - it's the Firebase identity
              // for this session, so we must not let the user change it.
              disableBusinessEmail
              errors={step1Errors}
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
              docs={form.docs}
              onDocsChange={(docs) => set("docs", docs)}
              onBack={() => setStep(2)}
              onSaveDraft={onFinishSignup}
              busy={busy}
              okMsg={okMsg}
              err={err}
              primaryLabel="Finish sign up"
              showTermsCheckbox
            />
          )}

          <div className="h-4" />
        </div>

        <WizardNavBar
          onBack={step > 1 ? handleBack : undefined}
          onNext={triggerStepSubmit}
          nextLabel={step === 3 ? "Finish" : "Next →"}
          busy={busy}
          tone="emerald"
        />
        </div>
      </main>
    </>
  );
}
