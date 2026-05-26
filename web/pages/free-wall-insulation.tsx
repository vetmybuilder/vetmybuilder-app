// web/pages/free-wall-insulation.tsx
//
// PRODUCTION page for the insulation grants funnel. Live at
// /free-wall-insulation. Captures homeowner answers, submits to
// POST /api/grant-leads, and renders the server-issued reference
// code on the confirmation screen.
//
// The /mocks/free-wall-insulation.tsx prototype is gitignored and
// stays around as a design sandbox; this file is the tracked, live
// version wired to the backend.

import Head from "next/head";
import { useMemo, useState } from "react";
import posthog from "posthog-js";
import BrandWordmark from "@/components/BrandWordmark";

type Step =
  | "landing"
  | "property"
  | "tenure"
  | "heating"
  | "epc"
  | "benefits"
  | "postcode"
  | "calculating"
  | "result"
  | "contact"
  | "confirmation";

type Answers = {
  property: string;
  tenure: string;
  heating: string;
  epc: string;
  benefits: string[];
  postcode: string;
  name: string;
  email: string;
  phone: string;
};

const EMPTY: Answers = {
  property: "",
  tenure: "",
  heating: "",
  epc: "",
  benefits: [],
  postcode: "",
  name: "",
  email: "",
  phone: "",
};

// Steps that count toward the 6-question progress bar.
const QUESTION_STEPS: Step[] = [
  "property",
  "tenure",
  "heating",
  "epc",
  "benefits",
  "postcode",
];

export default function FreeWallInsulation() {
  const [step, setStep] = useState<Step>("landing");
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  // Server-issued state after the Contact step is submitted. We don't
  // advance to the confirmation screen until the POST succeeds, so
  // the user never sees a reference code that doesn't exist server-
  // side.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [serverQualified, setServerQualified] = useState<
    "full" | "partial" | "none" | null
  >(null);

  function go(next: Step) {
    setStep(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      posthog.capture("grants_funnel_step", { step: next });
    }
  }

  async function submitLead() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/grant-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property: answers.property,
          tenure: answers.tenure,
          heating: answers.heating,
          epc: answers.epc,
          benefits: answers.benefits,
          postcode: answers.postcode,
          name: answers.name,
          email: answers.email,
          phone: answers.phone,
          consent: true,
          source:
            new URLSearchParams(
              typeof window === "undefined" ? "" : window.location.search,
            ).get("utm_source") || "direct",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error || "submit_failed");
        return;
      }
      setReference(data.reference);
      setServerQualified(data.qualified);
      posthog.capture("grants_lead_submitted", {
        qualified: data.qualified,
        postcode: answers.postcode,
        source: new URLSearchParams(window.location.search).get("utm_source") || "direct",
      });
      if (typeof (window as any).gtag === "function") {
        (window as any).gtag("event", "conversion", { send_to: "AW-18189420130/submit_lead_form" });
      }
      go("confirmation");
    } catch (e) {
      setSubmitError("network_error");
    } finally {
      setSubmitting(false);
    }
  }

  function set<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  // Single-select shortcut: set the answer AND advance to the next
  // step. The 220ms delay lets the user see the selection highlight
  // register before the screen slides away - removing it entirely
  // makes the tap feel like a misfire.
  function selectAndAdvance<K extends keyof Answers>(
    key: K,
    value: Answers[K],
    next: Step,
  ) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setTimeout(() => go(next), 220);
  }

  function toggleBenefit(value: string) {
    setAnswers((a) => {
      // Picking a real benefit always clears "none" - the two are
      // mutually exclusive.
      const without_none = a.benefits.filter((b) => b !== "none");
      const next = without_none.includes(value)
        ? without_none.filter((b) => b !== value)
        : [...without_none, value];
      return { ...a, benefits: next };
    });
  }

  // Mock eligibility scoring: qualified if user picked at least one
  // qualifying benefit AND (non-gas heating OR EPC D-G).
  const qualified = useMemo(() => {
    const hasBenefit =
      answers.benefits.length > 0 && !answers.benefits.includes("none");
    const heatingFlag = ["electric", "oil", "lpg", "other"].includes(
      answers.heating,
    );
    const epcFlag = ["D", "E", "F", "G"].includes(answers.epc);
    return hasBenefit && (heatingFlag || epcFlag);
  }, [answers]);

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const onQuestion = questionIndex >= 0;

  return (
    <>
      <Head>
        <title>Free Wall Insulation Check - Am I Eligible? | VetMyBuilder</title>
        <meta name="description" content="Check if your home qualifies for free wall insulation under a government grant. Takes 60 seconds - no obligations." />
        <link rel="canonical" href="https://vetmybuilder.com/free-wall-insulation" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://vetmybuilder.com/free-wall-insulation" />
        <meta property="og:title" content="Free Wall Insulation Check - Am I Eligible?" />
        <meta property="og:description" content="Check if your home qualifies for free wall insulation under a government grant. Takes 60 seconds - no obligations." />
        <meta property="og:image" content="https://vetmybuilder.com/vetmybuilder-eco4-hero.webp" />
        <meta property="og:site_name" content="VetMyBuilder" />
        <meta property="og:locale" content="en_GB" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Free Wall Insulation Check - Am I Eligible?" />
        <meta name="twitter:description" content="Check if your home qualifies for free wall insulation under a government grant. Takes 60 seconds - no obligations." />
        <meta name="twitter:image" content="https://vetmybuilder.com/vetmybuilder-eco4-hero.webp" />

        <meta name="robots" content="index, follow" />
        <meta name="keywords" content="free wall insulation, ECO4 grant, cavity wall insulation, government grant, energy efficiency, home insulation, EPC upgrade" />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": "Free Wall Insulation Eligibility Check",
          "description": "Check if your home qualifies for free wall insulation under a government grant. Takes 60 seconds - no obligations.",
          "url": "https://vetmybuilder.com/free-wall-insulation",
          "publisher": {
            "@type": "Organization",
            "name": "VetMyBuilder",
            "url": "https://vetmybuilder.com",
            "logo": { "@type": "ImageObject", "url": "https://vetmybuilder.com/logo.png" }
          },
          "mainEntity": {
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "Can I get free wall insulation?",
                "acceptedAnswer": { "@type": "Answer", "text": "You may qualify if you own or privately rent your home, have gas or oil heating, an EPC rating of D-G, and receive certain benefits like pension credit or universal credit." }
              },
              {
                "@type": "Question",
                "name": "How long does the eligibility check take?",
                "acceptedAnswer": { "@type": "Answer", "text": "The online check takes about 60 seconds. Answer a few questions about your property and we will tell you if you are likely to qualify." }
              },
              {
                "@type": "Question",
                "name": "What happens after I check my eligibility?",
                "acceptedAnswer": { "@type": "Answer", "text": "If you qualify, a vetted insulation specialist will contact you to arrange a free survey. There is no obligation and the installation is fully funded by the government ECO scheme." }
              }
            ]
          }
        }) }} />

        <style>{`body { background:#f8fafc; overflow-x: hidden; }`}</style>
      </Head>

      {/* ============ STICKY TOP BAR ============
          Dark navbar matches the rest of the VMB site (SiteHeader uses
          the same slate-950 chrome). BrandWordmark renders in its dark
          variant so the wordmark is identical to /tradesman/login. */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur supports-[backdrop-filter]:bg-slate-950/85 border-b border-slate-800">
        <div className="mx-auto max-w-3xl px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
          <button
            onClick={() => go("landing")}
            className="flex items-center"
            aria-label="Restart"
          >
            <BrandWordmark tone="emerald" />
          </button>

          {step === "calculating" ? (
            <span className="text-[11.5px] font-bold text-emerald-300 inline-flex items-center gap-2">
              <Spinner small />
              Scoring eligibility
            </span>
          ) : step === "landing" ? (
            <span className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full ring-1 ring-emerald-400/40 px-2.5 sm:px-3 py-1.5 text-[9.5px] sm:text-[10.5px] font-extrabold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-emerald-300 whitespace-nowrap shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="sm:hidden">Grant check</span>
              <span className="hidden sm:inline">Insulation grant check</span>
            </span>
          ) : (
            <HeaderBadge active={onQuestion ? questionIndex + 1 : null} />
          )}
        </div>

        {/* Slim gradient progress bar at the very bottom of the header.
            Replaces the pill-row - reads as a modern app indicator
            rather than a stepper widget. */}
        {onQuestion && (
          <div className="h-1 bg-slate-800 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-all duration-500 ease-out"
              style={{
                width: `${((questionIndex + 1) / QUESTION_STEPS.length) * 100}%`,
                background:
                  "linear-gradient(90deg,#10b981 0%,#34d399 50%,#6ee7b7 100%)",
                boxShadow: "0 0 12px rgba(52,211,153,0.6)",
              }}
            />
          </div>
        )}
      </header>

      <main className="min-h-[calc(100vh-56px)] relative overflow-x-hidden">
        {/* Top-of-content back chevron. Sits outside the keyed slide-in
            wrapper so it doesn't re-animate every step change. Hidden on
            landing / calculating / confirmation by the component itself. */}
        <BackChevron step={step} go={go} />

        {/* All step content lives inside a single keyed wrapper so only
            the question content animates between steps. The header
            (with its progress bar) and the sticky Footer stay mounted
            so they never flash - the experience reads as one continuous
            view rather than a multi-page wizard. */}
        <div
          key={step}
          style={step !== "landing" ? { animation: "vmbSlideIn 0.38s cubic-bezier(.2,.8,.2,1) both" } : undefined}
        >
          {step === "landing" && <Landing onStart={() => go("property")} />}

          {step === "property" && (
            <QuestionScreen
              step="property"
              title="What kind of home do you live in?"
              sub="Affects which insulation measures you can get under the grant."
              options={[
                { v: "semi", l: "Semi-detached" },
                { v: "detached", l: "Detached" },
                { v: "mid-terrace", l: "Mid-terrace" },
                { v: "end-terrace", l: "End-terrace" },
                { v: "bungalow", l: "Bungalow" },
                { v: "flat", l: "Flat" },
              ]}
              value={answers.property}
              onSelect={(v) => selectAndAdvance("property", v, "tenure")}
              grid
            />
          )}

          {step === "tenure" && (
            <QuestionScreen
              step="tenure"
              title="Do you own or rent your home?"
              sub="Renters need landlord consent. We'll handle the paperwork."
              options={[
                { v: "owner", l: "I own this home", sub: "Owner-occupier" },
                {
                  v: "private-rent",
                  l: "I rent privately",
                  sub: "Landlord approval required",
                },
                {
                  v: "social-rent",
                  l: "Council or housing association",
                  sub: "Talk to your landlord first",
                },
                {
                  v: "landlord",
                  l: "I'm the landlord",
                  sub: "Up to £15k of works per property",
                },
              ]}
              value={answers.tenure}
              onSelect={(v) => selectAndAdvance("tenure", v, "heating")}
            />
          )}

          {step === "heating" && (
            <QuestionScreen
              step="heating"
              title="How is your home heated?"
              sub="Non-gas heating often unlocks the most generous grant routes."
              options={[
                { v: "gas", l: "Gas boiler", sub: "Most common in the UK" },
                {
                  v: "electric",
                  l: "Electric storage heaters",
                  sub: "Higher grant value",
                },
                { v: "oil", l: "Oil-fired boiler" },
                { v: "lpg", l: "LPG" },
                { v: "other", l: "Other / not sure" },
              ]}
              value={answers.heating}
              onSelect={(v) => selectAndAdvance("heating", v, "epc")}
            />
          )}

          {step === "epc" && (
            <EPCScreen
              value={answers.epc}
              onSelect={(v) => selectAndAdvance("epc", v, "benefits")}
            />
          )}

          {step === "benefits" && (
            <BenefitsScreen
              value={answers.benefits}
              onToggle={toggleBenefit}
              onNone={() => set("benefits", ["none"])}
            />
          )}

          {step === "postcode" && (
            <PostcodeScreen
              value={answers.postcode}
              onChange={(v) => set("postcode", v)}
            />
          )}

          {step === "calculating" && (
            <CalculatingScreen onDone={() => go("result")} />
          )}

          {step === "result" && (
            <ResultScreen
              qualified={qualified}
              onContinue={() => go("contact")}
            />
          )}

          {step === "contact" && (
            <ContactScreen
              qualified={qualified}
              postcode={answers.postcode}
              name={answers.name}
              email={answers.email}
              phone={answers.phone}
              onChange={(k, v) => set(k as keyof Answers, v as never)}
            />
          )}

          {step === "confirmation" && (
            <ConfirmationScreen
              qualified={(serverQualified ?? (qualified ? "full" : "partial")) !== "none"}
              name={answers.name || "there"}
              reference={reference}
              onRestart={() => {
                setAnswers(EMPTY);
                setReference(null);
                setServerQualified(null);
                setSubmitError(null);
                go("landing");
              }}
            />
          )}
        </div>

        {/* Persistent Footer. Stays mounted across step changes so the
            CTA bar never flashes - only the question content above
            slides + cross-fades when the user advances. */}
        <PersistentFooter
          step={step}
          answers={answers}
          qualified={qualified}
          go={go}
          submitLead={submitLead}
          submitting={submitting}
        />
        {submitError && step === "contact" && (
          <div className="fixed left-0 right-0 bottom-[68px] z-50 flex justify-center pointer-events-none">
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[12.5px] font-bold rounded-full px-3 py-1.5 shadow-md pointer-events-auto">
              We couldn&apos;t send your request - {humanError(submitError)}
            </div>
          </div>
        )}
      </main>

      {step === "landing" && (
        <section className="bg-gradient-to-b from-[#064e3b] to-[#022c22] px-5 sm:px-8 md:px-12 lg:px-16 py-16 md:py-24">
          <div className="max-w-3xl mx-auto">
            <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-400 mb-3">
              Got questions?
            </p>
            <h2
              className="text-[26px] md:text-[36px] font-black text-white mb-10 md:mb-14 text-center"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              Frequently asked questions
            </h2>
            <div className="space-y-3">
              {[
                {
                  q: "What is the ECO4 free insulation scheme?",
                  a: "The Energy Company Obligation (ECO4) is a UK government programme that requires large energy suppliers to fund home insulation for qualifying households. If you are eligible, the full cost of cavity wall insulation, loft insulation, or solid wall insulation is covered - you pay nothing. The scheme runs alongside the Great British Insulation Scheme (GBIS) and together they fund up to £14,000 of work per property.",
                },
                {
                  q: "Who qualifies for free wall insulation?",
                  a: "Eligibility depends on your property, heating system, EPC rating, and whether you receive certain benefits. You are likely to qualify if you own or privately rent your home, your property has an EPC rating of D, E, F, or G, your home is heated by mains gas, oil, LPG, or electric storage heaters, and you receive a qualifying benefit such as Universal Credit, Pension Credit, Child Tax Credit, or Income Support. Even if you are not on benefits, you may still qualify under GBIS if your home has poor insulation and falls within certain council tax bands. Our free eligibility check takes 60 seconds and tells you instantly.",
                },
                {
                  q: "How does it work?",
                  a: "Complete our 60-second eligibility check above. If you qualify, a vetted insulation specialist contacts you to arrange a free home survey. The surveyor confirms the work needed and schedules the installation. Your insulation is installed at no cost to you - fully funded by the government scheme.",
                },
                {
                  q: "What types of insulation are covered?",
                  a: "ECO4 and GBIS cover cavity wall insulation, external wall insulation, internal wall insulation, loft insulation, underfloor insulation, and flat roof insulation. The type recommended for your home depends on its construction and current energy performance. A qualified surveyor will advise which measures deliver the best improvement.",
                },
                {
                  q: "Is it really free?",
                  a: "Yes. ECO4 is funded by energy companies as a legal obligation, not by taxpayers or homeowners. There is no upfront cost, no loan, and no catch. The installer is paid directly through the scheme. Every specialist on VetMyBuilder is vetted and verified before they can take on grant-funded work.",
                },
                {
                  q: "Is this available in my area?",
                  a: "We currently serve homeowners across East London and North East London, including Waltham Forest, Walthamstow, Chingford, Leyton, Leytonstone, and surrounding boroughs. Enter your postcode above to check if a vetted specialist covers your area.",
                },
              ].map(({ q, a }) => (
                <details key={q} className="group rounded-2xl bg-white/[0.07] backdrop-blur-sm border border-emerald-400/10 hover:border-emerald-400/25 transition-colors">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer px-6 py-5 text-[15px] md:text-[17px] font-bold text-white select-none list-none [&::-webkit-details-marker]:hidden">
                    {q}
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-500/20 shrink-0 transition-transform duration-200 group-open:rotate-180">
                      <svg
                        className="w-4 h-4 text-emerald-300"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </summary>
                  <p className="px-6 pb-5 text-[14px] md:text-[15px] text-emerald-100/80 leading-relaxed pr-14">
                    {a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <style jsx global>{`
        /* Pure horizontal slide for step transitions. No opacity fade,
           no blur - the new step content travels in from the right
           edge of the page so the eye reads the change as a deliberate
           shift, not a blink. */
        @keyframes vmbSlideIn {
          from {
            transform: translate3d(60px, 0, 0);
          }
          to {
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </>
  );
}

/* ====================================================================
   LANDING
   ==================================================================== */

/* MobileLandingHero - phone-first hero. Photo as a tight banner up
   top, snappy headline, prominent CTA, compact trust row. Replaces
   the desktop 2-col split on small viewports. */
function MobileLandingHero({ onStart }: { onStart: () => void }) {
  return (
    <section
      className="md:hidden relative text-white overflow-hidden"
      style={{ background: "#0e3a2f" }}
    >
      {/* Top banner photo - keeps the hero anchored visually so the
          page doesn't open as a pure block of green. Aspect 16:9 so
          it stays slim on phones. */}
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vetmybuilder-eco4-hero.webp"
          alt="A happy homeowner couple confirming they qualify for an ECO4 insulation grant"
          className="absolute inset-0 w-full h-full object-cover"
          loading="eager"
          decoding="async"
        />
        {/* Bottom-edge fade into the dark green */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background:
              "linear-gradient(to bottom, rgba(14,58,47,0) 0%, #0e3a2f 100%)",
          }}
        />
      </div>

      {/* Copy block */}
      <div className="px-5 pt-3 pb-6">
        <span className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-emerald-300/40 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-200">
          <span className="w-1 h-1 rounded-full bg-emerald-300 animate-pulse" />
          ECO4 + GBIS · 2026
        </span>

        <h1
          className="mt-3 text-[28px] font-black leading-[1.05] tracking-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          You could get{" "}
          <span className="relative inline-block">
            <span
              aria-hidden
              className="absolute inset-x-[-4px] inset-y-[6px] rounded-md"
              style={{
                background: "#10b981",
                transform: "rotate(-1.5deg)",
              }}
            />
            <span className="relative">FREE</span>
          </span>{" "}
          wall insulation.
        </h1>

        <p className="mt-3 text-[13.5px] text-emerald-100/85 leading-snug">
          Up to{" "}
          <span className="font-extrabold text-white">£14,000</span> of
          insulation funded by the government. 2-minute eligibility check.
        </p>

        <button
          onClick={onStart}
          data-testid="grants-start"
          className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-white text-emerald-900 py-3.5 text-[14.5px] font-extrabold shadow-lg"
        >
          Check my eligibility
          <span aria-hidden>→</span>
        </button>

        {/* Compact trust row - icons inline with tiny labels, no big
            circular outlines. Reads like an app footer pill row. */}
        <div className="mt-5 flex items-center justify-between gap-2 text-emerald-200/85">
          {[
            {
              l: "Free check",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              ),
            },
            {
              l: "No obligation",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                </svg>
              ),
            },
            {
              l: "Anonymous",
              icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </svg>
              ),
            },
          ].map((p, i, arr) => (
            <div
              key={p.l}
              className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-extrabold"
              style={
                i < arr.length - 1
                  ? { borderRight: "1px solid rgba(110,231,183,0.25)" }
                  : undefined
              }
            >
              {p.icon}
              <span className="leading-none">{p.l}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div>
      {/* ============================================================
          MOBILE HERO - native-app feel, not a shrunk desktop layout.
          Compact dark-green block with photo above the fold, snappy
          headline, prominent CTA, tight trust row. Hidden on md+.
          ============================================================ */}
      <MobileLandingHero onStart={onStart} />

      {/* ============================================================
          DESKTOP HERO - existing 2-col split: dark-emerald copy on
          the left, square photo on the right. Hidden on mobile so
          the dedicated mobile layout above can do its job.
          ============================================================ */}
      <section
        className="hidden md:block relative overflow-hidden text-white"
        style={{ background: "#0e3a2f" }}
      >
        {/* Faint dot pattern across the whole hero - sits below the
            grid so the copy column doesn't read as a flat block. */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
          aria-hidden
        >
          {Array.from({ length: 60 }).map((_, i) => {
            const cx = (i * 53) % 1600;
            const cy = (i * 91) % 800;
            return <circle key={i} cx={cx} cy={cy} r="3" fill="#a7f3d0" />;
          })}
        </svg>

        <div className="relative grid md:grid-cols-2 items-stretch">
          {/* LEFT - copy column. min-h gates the mobile-only single-col
              layout; on desktop the row height is driven by the image
              column (which uses aspect-square to render naturally). */}
          <div className="px-5 sm:px-8 md:pl-12 lg:pl-16 py-12 md:py-16 flex flex-col justify-center min-h-[440px] max-w-2xl">
            <span className="inline-flex self-start items-center gap-2 rounded-full ring-1 ring-emerald-300/40 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              ECO4 + GBIS scheme - 2026
            </span>

            <h1
              className="mt-5 text-[32px] sm:text-[44px] md:text-[60px] font-black leading-[1.02] tracking-tight"
              style={{ fontFamily: "'Sora', sans-serif" }}
            >
              You could get{" "}
              <span className="relative inline-block">
                <span
                  aria-hidden
                  className="absolute inset-x-[-6px] inset-y-[10px] rounded-md"
                  style={{
                    background: "#10b981",
                    transform: "rotate(-1.5deg)",
                  }}
                />
                <span className="relative">FREE</span>
              </span>{" "}
              wall insulation.
            </h1>

            <p className="mt-5 text-[15px] md:text-[17px] text-emerald-100/85 leading-relaxed max-w-md">
              The government is funding up to{" "}
              <span className="font-extrabold text-white">£14,000</span> of
              insulation work per home. Check if your property qualifies
              in under 2 minutes.
            </p>

            <button
              onClick={onStart}
              data-testid="grants-start"
              className="mt-8 inline-flex self-start items-center justify-center gap-2 rounded-full bg-white text-emerald-900 px-7 py-4 text-[15px] font-extrabold shadow-2xl hover:-translate-y-0.5 transition-transform group"
            >
              Check my eligibility
              <span className="transition-transform duration-300 ease-out group-hover:translate-x-1">
                →
              </span>
            </button>

            {/* Trust pillars - 3 circular icons under the CTA,
                separated by faint vertical dividers (pipes) as in the
                design mock. Allowed to wrap on narrow viewports. */}
            <div className="mt-10 flex items-stretch gap-3 sm:gap-5 flex-wrap">
              <TrustPillar
                label="Free check"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                }
              />
              <TrustDivider />
              <TrustPillar
                label="No obligation"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                }
              />
              <TrustDivider />
              <TrustPillar
                label="Anonymous"
                sub="until you submit"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* RIGHT - lifestyle photograph. Desktop only. The 1200x900
              .webp already includes the glowing house outline and the
              "Warmer home, happier future" caption baked in. A left-
              edge mask-image gradient feathers the photo into the
              dark-green column so there's no hard square boundary. */}
          <div className="relative hidden md:block overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/vetmybuilder-eco4-hero.webp"
              alt="A happy homeowner couple confirming they qualify for an ECO4 insulation grant"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                maskImage:
                  "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent 0%, black 12%, black 100%)",
              }}
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* TRUST STRIP - bespoke illustration tiles. Each tile has a
          custom flat scene on a tinted background plus a label and
          supporting line. Feels custom-designed, not icon-fonty. */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="mx-auto max-w-5xl px-5 py-7 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              l: "Government scheme",
              s: "ECO4 + GBIS",
              illo: <TrustBigBen />,
            },
            {
              l: "Verified by VMB",
              s: "Every specialist checked",
              illo: <TrustBadge />,
            },
            {
              l: "Private + secure",
              s: "Data stays with you",
              illo: <TrustVault />,
            },
            {
              l: "Local to you",
              s: "Waltham Forest first",
              illo: <TrustMap />,
            },
          ].map((b) => (
            <div
              key={b.l}
              className="bg-white rounded-2xl border border-slate-200/80 p-3.5 flex items-center gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#ecfdf5,#d1fae5)" }}>
                {b.illo}
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] font-extrabold text-slate-900 leading-tight">
                  {b.l}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                  {b.s}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-slate-50 py-12 md:py-16">
        <div className="mx-auto max-w-5xl px-5 text-center">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
            How it works
          </span>
          <h2
            className="mt-2 text-[22px] sm:text-[28px] md:text-[36px] font-black text-slate-900 leading-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            From check to installed in days, not months.
          </h2>
          <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-600 max-w-xl mx-auto">
            We don&apos;t do the work ourselves - we connect you with a
            verified local specialist who handles the survey, grant
            paperwork and install.
          </p>
        </div>

        <div className="mx-auto max-w-5xl px-5 mt-10 grid md:grid-cols-4 gap-4">
          {[
            {
              t: "2-min check",
              d: "Answer 6 short questions. No personal details needed.",
              c: "#10b981",
              bg: "#ecfdf5",
              illo: <IlloChecklist />,
            },
            {
              t: "Get your verdict",
              d: "Instant eligibility result + indicative savings.",
              c: "#0ea5e9",
              bg: "#ecfeff",
              illo: <IlloVerdict />,
            },
            {
              t: "Free survey",
              d: "A verified local specialist visits your home.",
              c: "#8b5cf6",
              bg: "#f5f3ff",
              illo: <IlloSurvey />,
            },
            {
              t: "Install",
              d: "Most jobs complete in 2 to 5 days on site.",
              c: "#f59e0b",
              bg: "#fffbeb",
              illo: <IlloInstall />,
            },
          ].map((s, i) => (
            <div
              key={s.t}
              className="rounded-2xl bg-white p-5 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden"
            >
              <div
                className="rounded-xl flex items-center justify-center h-20 mb-3"
                style={{ background: s.bg }}
              >
                {s.illo}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[10.5px] font-extrabold uppercase tracking-wider"
                  style={{ color: s.c }}
                >
                  Step {i + 1}
                </span>
                <span
                  className="h-px flex-1"
                  style={{ background: s.c, opacity: 0.25 }}
                />
              </div>
              <div className="mt-2 text-[15.5px] font-extrabold text-slate-900 leading-tight">
                {s.t}
              </div>
              <div className="mt-1 text-[12.5px] text-slate-600 leading-snug">
                {s.d}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-3xl px-5 mt-10 text-center">
          <button
            onClick={onStart}
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-[15px] font-extrabold text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 transition-transform"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            Start my 2-minute check →
          </button>
          <div className="mt-3 text-[11.5px] text-slate-500">
            By continuing you agree to our{" "}
            <span className="underline">terms</span> +{" "}
            <span className="underline">privacy policy</span>.
          </div>
        </div>
      </section>
    </div>
  );
}

/* ====================================================================
   GENERIC QUESTION SCREEN
   ==================================================================== */

function QuestionScreen({
  title,
  sub,
  options,
  value,
  onSelect,
  grid = false,
  step,
}: {
  title: string;
  sub: string;
  options: { v: string; l: string; sub?: string }[];
  value: string;
  onSelect: (v: string) => void;
  grid?: boolean;
  step: Step;
}) {
  return (
    <Shell step={step}>
      <h2
        className="text-[22px] sm:text-[26px] md:text-[32px] font-black text-slate-900 leading-[1.15]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {title}
      </h2>
      <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-500 leading-snug max-w-lg">
        {sub}
      </p>

      <div
        className={`mt-7 ${
          grid
            ? "grid grid-cols-2 md:grid-cols-3 gap-3"
            : "grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl"
        }`}
      >
        {options.map((o) => (
          <SelectTile
            key={o.v}
            label={o.l}
            sub={o.sub}
            selected={value === o.v}
            onClick={() => onSelect(o.v)}
          />
        ))}
      </div>
    </Shell>
  );
}

/* ====================================================================
   EPC
   ==================================================================== */

function EPCScreen({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (v: string) => void;
}) {
  const ratings: { l: string; c: string }[] = [
    { l: "A", c: "#15803d" },
    { l: "B", c: "#22c55e" },
    { l: "C", c: "#84cc16" },
    { l: "D", c: "#eab308" },
    { l: "E", c: "#f59e0b" },
    { l: "F", c: "#f97316" },
    { l: "G", c: "#dc2626" },
  ];
  return (
    <Shell step="epc">
      <h2
        className="text-[22px] sm:text-[26px] md:text-[32px] font-black text-slate-900 leading-[1.15]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        What&apos;s your home&apos;s EPC rating?
      </h2>
      <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-500 max-w-lg">
        D or worse usually qualifies. Don&apos;t know? We&apos;ll look it
        up by postcode at the end.
      </p>

      <div className="mt-7 grid grid-cols-4 md:grid-cols-8 gap-2 max-w-xl">
        {ratings.map((r) => {
          const selected = value === r.l;
          return (
            <button
              key={r.l}
              onClick={() => onSelect(r.l)}
              className={`aspect-square rounded-xl text-white text-[26px] font-black transition-transform ${
                selected
                  ? "ring-4 ring-emerald-300 scale-[1.06] shadow-lg"
                  : "hover:scale-[1.03]"
              }`}
              style={{ background: r.c }}
              aria-label={`EPC ${r.l}`}
            >
              {r.l}
            </button>
          );
        })}
        <button
          onClick={() => onSelect("?")}
          className={`aspect-square rounded-xl border-2 text-[11px] font-extrabold transition-transform flex items-center justify-center text-center leading-tight ${
            value === "?"
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-dashed border-slate-300 text-slate-600 bg-white"
          }`}
        >
          Not<br />sure
        </button>
      </div>
    </Shell>
  );
}

/* ====================================================================
   BENEFITS
   ==================================================================== */

function BenefitsScreen({
  value,
  onToggle,
  onNone,
}: {
  value: string[];
  onToggle: (v: string) => void;
  onNone: () => void;
}) {
  const items = [
    { v: "pension-credit", l: "Pension Credit" },
    { v: "universal-credit", l: "Universal Credit" },
    { v: "child-benefit", l: "Child Benefit (income capped)" },
    { v: "income-support", l: "Income Support" },
    { v: "jsa", l: "Income-based JSA / ESA" },
    { v: "housing-benefit", l: "Housing Benefit" },
    { v: "tax-credit", l: "Working / Child Tax Credit" },
  ];
  const noneSelected = value.includes("none");
  return (
    <Shell step="benefits">
      <h2
        className="text-[22px] sm:text-[26px] md:text-[32px] font-black text-slate-900 leading-[1.15]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        Does anyone in your home receive any of these?
      </h2>
      <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-500 max-w-lg">
        Tick all that apply. Private - we don&apos;t share this with
        anyone without your permission.
      </p>

      <div className="mt-7 grid sm:grid-cols-2 gap-2 max-w-2xl">
        {items.map((item) => {
          const selected = value.includes(item.v);
          return (
            <button
              key={item.v}
              onClick={() => onToggle(item.v)}
              className="group relative text-left rounded-xl px-3.5 py-3 flex items-center gap-3 bg-white transition-all hover:-translate-y-0.5"
              style={{
                border: selected ? "2px solid #10b981" : "1.5px solid #e2e8f0",
                boxShadow: selected
                  ? "0 6px 20px -6px rgba(16,185,129,0.35)"
                  : undefined,
              }}
            >
              <span
                className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                  selected
                    ? "bg-emerald-600 text-white"
                    : "bg-white border-2 border-slate-300 group-hover:border-emerald-300"
                }`}
                style={
                  selected
                    ? { boxShadow: "0 2px 6px rgba(5,150,105,0.4)" }
                    : undefined
                }
              >
                {selected ? "✓" : ""}
              </span>
              <span className="text-[13.5px] font-bold text-slate-800">
                {item.l}
              </span>
            </button>
          );
        })}

        {/* "None of these" matches the size and structure of the
            other tiles. Dashed border keeps it visually distinct as
            the exclusive opt-out, but no longer smaller / orphaned. */}
        <button
          onClick={onNone}
          className="group relative text-left rounded-xl px-3.5 py-3 flex items-center gap-3 bg-white transition-all hover:-translate-y-0.5 sm:col-span-2"
          style={{
            border: noneSelected
              ? "2px solid #10b981"
              : "1.5px dashed #cbd5e1",
            boxShadow: noneSelected
              ? "0 6px 20px -6px rgba(16,185,129,0.35)"
              : undefined,
          }}
        >
          <span
            className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
              noneSelected
                ? "bg-emerald-600 text-white"
                : "bg-white border-2 border-slate-300 group-hover:border-emerald-300"
            }`}
            style={
              noneSelected
                ? { boxShadow: "0 2px 6px rgba(5,150,105,0.4)" }
                : undefined
            }
          >
            {noneSelected ? "✓" : ""}
          </span>
          <span className="text-[13.5px] font-bold text-slate-800">
            None of these
          </span>
        </button>
      </div>
    </Shell>
  );
}

/* ====================================================================
   POSTCODE
   ==================================================================== */

function PostcodeScreen({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = /^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2}$/i.test(
    value.trim(),
  );
  return (
    <Shell step="postcode">
      <h2
        className="text-[22px] sm:text-[26px] md:text-[32px] font-black text-slate-900 leading-[1.15]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        And finally - where&apos;s your home?
      </h2>
      <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-500 max-w-lg">
        We use your postcode to confirm a verified specialist works in
        your area. Nothing else.
      </p>

      <div className="mt-7 max-w-md">
        <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
          Postcode
        </label>
        {/* No autoFocus - on mobile the browser pulls the focused
            input into view during the step slide-in animation, which
            yanks the layout sideways and crops the field. */}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="E17 8QR"
          inputMode="text"
          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3.5 text-[18px] font-extrabold tracking-wider bg-white focus:border-emerald-500 focus:outline-none"
        />
        {value && !valid && (
          <p className="mt-2 text-[12px] text-amber-700 font-bold">
            Hmm, that doesn&apos;t look like a UK postcode. Format:
            &quot;E17 8QR&quot;.
          </p>
        )}
        {valid && (
          <p className="mt-2 text-[12px] text-emerald-700 font-bold inline-flex items-center gap-1">
            <span>✓</span>
            Looks good - covered by a verified specialist
          </p>
        )}
      </div>
    </Shell>
  );
}

/* ====================================================================
   CALCULATING
   ==================================================================== */

function CalculatingScreen({ onDone }: { onDone: () => void }) {
  // Auto-advance after a short pause to simulate scoring.
  if (typeof window !== "undefined") {
    setTimeout(onDone, 1800);
  }
  return (
    <Shell step="calculating">
      <div className="text-center py-16">
        <Spinner />
        <h2
          className="mt-6 text-[24px] md:text-[28px] font-black text-slate-900"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          Checking your eligibility...
        </h2>
        <p className="mt-2 text-[13.5px] text-slate-500 max-w-md mx-auto leading-snug">
          We&apos;re cross-referencing your answers against the ECO4 and
          GBIS scheme rules. Hold tight.
        </p>
        <div className="mt-8 space-y-2 max-w-xs mx-auto text-left">
          {[
            "Property type checked",
            "Heating fuel matched",
            "EPC band scored",
            "Benefits eligibility...",
          ].map((s, i) => (
            <div
              key={s}
              className="flex items-center gap-2 text-[12.5px] font-bold text-slate-700"
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white ${
                  i < 3 ? "bg-emerald-500" : "bg-slate-200"
                }`}
              >
                {i < 3 ? "✓" : ""}
              </span>
              {s}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ====================================================================
   RESULT - with details locked behind contact form
   ==================================================================== */

function ResultScreen({
  qualified,
  onContinue,
}: {
  qualified: boolean;
  onContinue: () => void;
}) {
  return (
    <Shell step="result">
      <div
        className="relative rounded-3xl overflow-hidden text-white p-7 md:p-10"
        style={{
          background: qualified
            ? "linear-gradient(135deg,#022c22 0%,#064e3b 35%,#10b981 100%)"
            : "linear-gradient(135deg,#7c2d12 0%,#9a3412 35%,#f59e0b 100%)",
        }}
      >
        <span
          className={`inline-block rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] ${
            qualified
              ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/30"
              : "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/30"
          }`}
        >
          {qualified ? "Eligibility result" : "Almost - here's the catch"}
        </span>
        <h2
          className="mt-3 text-[30px] md:text-[42px] font-black leading-[1.05]"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          {qualified
            ? "You may qualify for FREE wall insulation."
            : "You don't fully qualify - but you can still save."}
        </h2>
        <p
          className={`mt-3 text-[14px] md:text-[15.5px] max-w-2xl leading-snug ${
            qualified ? "text-emerald-50/90" : "text-amber-50/90"
          }`}
        >
          {qualified
            ? "Based on your answers, your home looks eligible under the ECO4 scheme."
            : "You're not on the qualifying benefits list, but the Great British Insulation Scheme + 0% finance still apply."}
        </p>

        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          {(qualified
            ? [
                { l: "External wall insulation", v: "Up to £8,500" },
                { l: "Loft top-up", v: "Up to £600" },
                { l: "Smart heating controls", v: "Up to £200" },
              ]
            : [
                { l: "GBIS partial grant", v: "Up to £1,500" },
                { l: "0% finance", v: "24 months" },
                { l: "Free survey", v: "No obligation" },
              ]
          ).map((m) => (
            <div
              key={m.l}
              className="rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/15 p-3.5"
            >
              <div
                className={`text-[10.5px] font-extrabold uppercase tracking-wider ${
                  qualified ? "text-emerald-100" : "text-amber-100"
                }`}
              >
                {m.l}
              </div>
              <div className="mt-1 text-[20px] font-black">{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Locked detail panel */}
      <div className="mt-6 rounded-3xl bg-white border border-slate-200 p-5 md:p-7 relative overflow-hidden">
        <div className="grid md:grid-cols-[1fr_auto] gap-4 items-center">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Verified local specialist
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-[18px] shrink-0"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                EB
              </div>
              <div>
                <div className="text-[16px] font-extrabold text-slate-900">
                  Elegant Building
                </div>
                <div className="text-[12px] text-slate-500">
                  Waltham Forest · 4.9 ★ · 212 reviews
                </div>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-slate-600 leading-relaxed max-w-md">
              Enter your details to see your full report, your estimated
              savings, and to book a free survey with Elegant Building.
            </p>
          </div>

          <button
            onClick={onContinue}
            data-testid="grants-claim"
            className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[14px] font-extrabold text-white shadow-lg shadow-emerald-500/30 hover:-translate-y-0.5 transition-transform whitespace-nowrap"
            style={{
              background: qualified
                ? "linear-gradient(135deg,#10b981,#059669)"
                : "linear-gradient(135deg,#f97316,#ea580c)",
            }}
          >
            {qualified ? "Claim my survey" : "Get a free quote"} →
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-[11.5px] text-slate-500">
        Your data only leaves VetMyBuilder when you click the button above.
      </p>
    </Shell>
  );
}

/* ====================================================================
   CONTACT - lead capture
   ==================================================================== */

function ContactScreen({
  qualified,
  postcode,
  name,
  email,
  phone,
  onChange,
}: {
  qualified: boolean;
  postcode: string;
  name: string;
  email: string;
  phone: string;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <Shell step="contact">
      <h2
        className="text-[22px] sm:text-[26px] md:text-[32px] font-black text-slate-900 leading-[1.15]"
        style={{ fontFamily: "'Sora', sans-serif" }}
      >
        {qualified
          ? "Last step - book your free survey."
          : "Last step - get your free quote."}
      </h2>
      <p className="mt-2 text-[13.5px] md:text-[14.5px] text-slate-500 max-w-lg">
        A specialist from Elegant Building will call within 24h to
        arrange a date that works for you.
      </p>

      <div className="mt-7 grid md:grid-cols-2 gap-3 max-w-2xl">
        <Field label="Your name">
          <input
            value={name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Jane Patel"
            className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-3 text-[14.5px] bg-white focus:border-emerald-500 focus:outline-none"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => onChange("phone", e.target.value)}
            placeholder="07..."
            inputMode="tel"
            className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-3 text-[14.5px] bg-white focus:border-emerald-500 focus:outline-none"
          />
        </Field>
        <Field label="Email" className="md:col-span-2">
          <input
            value={email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-3 text-[14.5px] bg-white focus:border-emerald-500 focus:outline-none"
          />
        </Field>
        <Field label="Postcode" className="md:col-span-2">
          <input
            value={postcode}
            readOnly
            className="w-full rounded-xl border-2 border-slate-200 px-3.5 py-3 text-[14.5px] bg-slate-50 font-extrabold"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 mt-5 text-[12.5px] text-slate-600 leading-snug max-w-xl">
        <input type="checkbox" defaultChecked className="mt-0.5" />
        <span>
          I&apos;m happy for a verified VetMyBuilder specialist to contact
          me about my eligibility result. I can opt out any time.
        </span>
      </label>
    </Shell>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/* ====================================================================
   CONFIRMATION
   ==================================================================== */

function ConfirmationScreen({
  qualified,
  name,
  reference,
  onRestart,
}: {
  qualified: boolean;
  name: string;
  reference: string | null;
  onRestart: () => void;
}) {
  return (
    <Shell step="confirmation">
      <div className="text-center pt-10 pb-6">
        <div className="relative mx-auto w-20 h-20">
          <div
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ background: "#10b981" }}
          />
          <div
            className="relative w-20 h-20 rounded-full flex items-center justify-center text-white text-4xl"
            style={{
              background: "linear-gradient(135deg,#10b981,#059669)",
            }}
          >
            ✓
          </div>
        </div>
        <h2
          className="mt-6 text-[30px] md:text-[36px] font-black text-slate-900 leading-tight"
          style={{ fontFamily: "'Sora', sans-serif" }}
        >
          You&apos;re booked in, {name}.
        </h2>
        <p className="mt-3 text-[14px] text-slate-600 max-w-md mx-auto leading-snug">
          We&apos;ve sent your details to{" "}
          <span className="font-extrabold text-slate-900">
            Elegant Building
          </span>
          . They&apos;ll call within 24 hours to arrange your{" "}
          {qualified ? "free survey" : "no-obligation quote"}.
        </p>
      </div>

      <div className="mx-auto max-w-md rounded-2xl bg-slate-50 border border-slate-200 p-5">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-3">
          What happens next
        </div>
        <ol className="space-y-3">
          {[
            "Elegant calls you to confirm a date",
            qualified
              ? "Free 30-minute survey, no pressure"
              : "Free quote visit, no obligation",
            "Fixed written quote within 48h",
            "Install scheduled - 2 to 5 days on site",
          ].map((s, i) => (
            <li key={s} className="flex items-start gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full text-white text-[11px] font-extrabold flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {i + 1}
              </span>
              <span className="text-[13.5px] text-slate-700 leading-snug pt-0.5">
                {s}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={onRestart}
          className="text-[12.5px] font-extrabold text-emerald-700 underline"
        >
          Run the check again
        </button>
        <span className="text-[10.5px] text-slate-400">
          Reference {reference ?? "pending"} · Lead routed to Elegant Building
        </span>
      </div>
    </Shell>
  );
}

/* ====================================================================
   SHELL + FOOTER
   ==================================================================== */

function Shell({
  children,
  step,
}: {
  children: React.ReactNode;
  step: Step;
}) {
  // Every step renders 2-col on desktop: a step-specific abstract
  // illustration on the left, the question / form content on the
  // right. Mobile collapses to single column with the illustration
  // hidden so the question content stays scannable.
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-32 md:pt-12">
      <div className="grid md:grid-cols-[1fr_1.1fr] gap-8 md:gap-10 items-start">
        <div className="hidden md:block md:sticky md:top-24">
          <StepIllustration step={step} />
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

/* ====================================================================
   STEP ILLUSTRATIONS - one abstract emerald-themed scene per step.
   Inline SVGs so we don't ship asset files or block on a designer.
   ==================================================================== */

function StepIllustration({ step }: { step: Step }) {
  const map: Record<Step, React.ReactNode> = {
    landing: null,
    property: <PropertyIllo />,
    tenure: <TenureIllo />,
    heating: <HeatingIllo />,
    epc: <EPCIllo />,
    benefits: <BenefitsIllo />,
    postcode: <PostcodeIllo />,
    calculating: <CalculatingIllo />,
    result: <ResultIllo />,
    contact: <ContactIllo />,
    confirmation: <ConfirmationIllo />,
  };
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl shadow-xl flex items-center justify-center"
      style={{
        aspectRatio: "1 / 1",
        background:
          "linear-gradient(135deg,#022c22 0%,#064e3b 45%,#047857 100%)",
      }}
    >
      {/* faint scattered dots over the green */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.10] pointer-events-none" aria-hidden>
        {Array.from({ length: 40 }).map((_, i) => {
          const cx = (i * 47) % 600;
          const cy = (i * 83) % 600;
          return <circle key={i} cx={cx} cy={cy} r="3" fill="#a7f3d0" />;
        })}
      </svg>
      <div className="relative w-3/4 h-3/4 flex items-center justify-center">
        {map[step]}
      </div>
    </div>
  );
}

function PropertyIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* semi-detached on left */}
      <path d="M20 170 L20 100 L60 70 L100 100 L100 170 Z" />
      <path d="M60 70 L60 50" />
      {/* detached middle */}
      <path d="M115 170 L115 95 L150 65 L185 95 L185 170 Z" fill="rgba(167,243,208,0.10)" />
      <rect x="140" y="125" width="20" height="45" />
      {/* small bungalow on right */}
      <path d="M195 170 L195 130 L215 115 L235 130 L235 170 Z" />
    </svg>
  );
}

function TenureIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* key */}
      <circle cx="80" cy="100" r="32" />
      <circle cx="80" cy="100" r="12" fill="#a7f3d0" stroke="none" />
      <path d="M112 100 L210 100" />
      <path d="M170 100 L170 120" />
      <path d="M190 100 L190 125" />
      {/* tag */}
      <rect x="40" y="148" width="60" height="32" rx="6" fill="rgba(167,243,208,0.10)" />
    </svg>
  );
}

function HeatingIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* radiator */}
      <rect x="50" y="60" width="140" height="100" rx="10" />
      {[70, 95, 120, 145, 170].map((x) => (
        <line key={x} x1={x} y1="70" x2={x} y2="150" />
      ))}
      {/* heat waves */}
      <path d="M80 40 Q 90 25, 100 40 T 120 40" />
      <path d="M130 30 Q 140 15, 150 30 T 170 30" />
    </svg>
  );
}

function EPCIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" aria-hidden>
      {[
        { y: 30, w: 80, c: "#22c55e", l: "A" },
        { y: 50, w: 100, c: "#65a30d", l: "B" },
        { y: 70, w: 120, c: "#a3e635", l: "C" },
        { y: 90, w: 140, c: "#facc15", l: "D" },
        { y: 110, w: 160, c: "#fb923c", l: "E" },
        { y: 130, w: 180, c: "#f97316", l: "F" },
        { y: 150, w: 200, c: "#ef4444", l: "G" },
      ].map((row) => (
        <g key={row.l}>
          <rect x="20" y={row.y} width={row.w} height="14" fill={row.c} rx="3" />
          <text
            x={28 + row.w}
            y={row.y + 11}
            fill="#a7f3d0"
            fontSize="11"
            fontWeight="800"
          >
            {row.l}
          </text>
        </g>
      ))}
    </svg>
  );
}

function BenefitsIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* stacked coins */}
      <ellipse cx="120" cy="155" rx="60" ry="14" fill="rgba(167,243,208,0.15)" />
      <ellipse cx="120" cy="135" rx="60" ry="14" fill="rgba(167,243,208,0.15)" />
      <ellipse cx="120" cy="115" rx="60" ry="14" fill="rgba(167,243,208,0.20)" />
      <ellipse cx="120" cy="95" rx="60" ry="14" fill="rgba(167,243,208,0.25)" />
      <ellipse cx="120" cy="75" rx="60" ry="14" fill="#a7f3d0" stroke="#a7f3d0" />
      {/* £ symbol on top */}
      <text x="120" y="83" fill="#022c22" fontSize="22" fontWeight="900" textAnchor="middle" stroke="none">
        £
      </text>
    </svg>
  );
}

function PostcodeIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* grid map */}
      <path d="M20 50 L220 50 M20 100 L220 100 M20 150 L220 150" opacity="0.4" />
      <path d="M70 30 L70 180 M120 30 L120 180 M170 30 L170 180" opacity="0.4" />
      {/* pin */}
      <path d="M120 60 C 90 60, 90 100, 120 130 C 150 100, 150 60, 120 60 Z" fill="rgba(167,243,208,0.20)" />
      <circle cx="120" cy="90" r="10" fill="#a7f3d0" stroke="none" />
    </svg>
  );
}

function CalculatingIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* concentric rings - the spinner on the page itself does the animation */}
      <circle cx="120" cy="100" r="60" opacity="0.3" />
      <circle cx="120" cy="100" r="42" opacity="0.55" />
      <circle cx="120" cy="100" r="24" />
      <path d="M120 100 L160 60" />
      <circle cx="120" cy="100" r="5" fill="#a7f3d0" stroke="none" />
    </svg>
  );
}

function ResultIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* gauge arc */}
      <path d="M40 150 A 80 80 0 0 1 200 150" />
      <path d="M40 150 A 80 80 0 0 1 165 85" stroke="#34d399" strokeWidth="5" />
      {/* needle */}
      <line x1="120" y1="150" x2="155" y2="95" stroke="#a7f3d0" strokeWidth="4" />
      <circle cx="120" cy="150" r="8" fill="#a7f3d0" stroke="none" />
    </svg>
  );
}

function ContactIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* phone */}
      <rect x="70" y="30" width="100" height="160" rx="14" fill="rgba(167,243,208,0.10)" />
      <line x1="100" y1="50" x2="140" y2="50" />
      {/* chat bubble */}
      <rect x="85" y="70" width="70" height="34" rx="8" />
      {/* dots */}
      <circle cx="105" cy="87" r="3" fill="#a7f3d0" stroke="none" />
      <circle cx="120" cy="87" r="3" fill="#a7f3d0" stroke="none" />
      <circle cx="135" cy="87" r="3" fill="#a7f3d0" stroke="none" />
      {/* second bubble */}
      <rect x="85" y="115" width="50" height="26" rx="8" fill="rgba(167,243,208,0.10)" />
    </svg>
  );
}

function ConfirmationIllo() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-full" fill="none" stroke="#a7f3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* big circle with tick */}
      <circle cx="120" cy="100" r="60" fill="rgba(167,243,208,0.18)" />
      <circle cx="120" cy="100" r="60" />
      <path d="M90 102 L112 124 L154 80" strokeWidth="5" />
      {/* sparkles */}
      <path d="M40 50 L40 70 M30 60 L50 60" strokeWidth="2.5" />
      <path d="M200 140 L200 160 M190 150 L210 150" strokeWidth="2.5" />
      <path d="M180 40 L180 56 M172 48 L188 48" strokeWidth="2.5" opacity="0.7" />
    </svg>
  );
}

/* PersistentFooter - mounted once at the page level. Reads the current
   step and computes the right Back / Next behaviour. Stays in the DOM
   across step changes so the CTA bar doesn't flash - only its labels
   and disabled state update. */
function humanError(code: string): string {
  switch (code) {
    case "network_error":
      return "please check your connection.";
    case "invalid_email":
      return "that email doesn't look right.";
    case "invalid_phone":
      return "that phone number doesn't look right.";
    case "invalid_postcode":
      return "that postcode doesn't look right.";
    case "missing_name":
      return "we need your name.";
    default:
      return "please try again.";
  }
}

function PersistentFooter({
  step,
  answers,
  qualified,
  go,
  submitLead,
  submitting,
}: {
  step: Step;
  answers: Answers;
  qualified: boolean;
  go: (s: Step) => void;
  submitLead: () => void | Promise<void>;
  submitting: boolean;
}) {
  const postcodeValid = /^[A-Z]{1,2}[0-9R][0-9A-Z]?\s*[0-9][A-Z]{2}$/i.test(
    answers.postcode.trim(),
  );
  const contactValid = !!(
    answers.name.trim() &&
    answers.email.includes("@") &&
    answers.phone.length >= 7
  );

  let cfg: {
    onBack: () => void;
    onNext: (() => void) | null;
    canNext: boolean;
    nextLabel?: string;
  } | null = null;

  switch (step) {
    case "property":
      cfg = {
        onBack: () => go("landing"),
        // Single-select - auto-advances on tap, no Next button needed.
        onNext: null,
        canNext: false,
      };
      break;
    case "tenure":
      cfg = {
        onBack: () => go("property"),
        onNext: null,
        canNext: false,
      };
      break;
    case "heating":
      cfg = {
        onBack: () => go("tenure"),
        onNext: null,
        canNext: false,
      };
      break;
    case "epc":
      cfg = {
        onBack: () => go("heating"),
        onNext: null,
        canNext: false,
      };
      break;
    case "benefits":
      cfg = {
        onBack: () => go("epc"),
        onNext: () => go("postcode"),
        canNext: answers.benefits.length > 0,
      };
      break;
    case "postcode":
      cfg = {
        onBack: () => go("benefits"),
        onNext: () => go("calculating"),
        canNext: postcodeValid,
      };
      break;
    case "contact":
      cfg = {
        onBack: () => go("result"),
        // Submit lands in grant_leads on the server. The submit
        // helper advances to "confirmation" only on a successful
        // 2xx response, so the user never sees a reference code
        // that doesn't exist in the database.
        onNext: () => submitLead(),
        canNext: contactValid && !submitting,
        nextLabel: submitting
          ? "Sending..."
          : qualified
            ? "Book my survey →"
            : "Send my quote request →",
      };
      break;
    default:
      cfg = null;
  }

  if (!cfg) return null;
  return <Footer {...cfg} />;
}

function Footer({
  onNext,
  canNext,
  nextLabel = "Continue →",
}: {
  // onBack is intentionally absent - Back lives as a chevron at the
  // top of the content area now, not in the footer.
  onNext: (() => void) | null;
  canNext: boolean;
  nextLabel?: string;
}) {
  // Footer only mounts when there's a Next action. Single-select
  // steps auto-advance and have no Footer at all.
  if (!onNext) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 z-40">
      <div className="mx-auto max-w-3xl px-5 py-3 flex items-center justify-end">
        <button
          onClick={canNext ? onNext : undefined}
          disabled={!canNext}
          className="w-full sm:w-auto sm:min-w-[260px] inline-flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-[14px] font-extrabold text-white shadow-lg shadow-emerald-500/25 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}

/* BackChevron - small circular button rendered at the top-left of the
   content area on every step except landing / calculating / confirmation.
   Replaces the "Back" button that previously lived in the bottom footer
   (which looked cluttered next to the primary CTA). */
function BackChevron({
  step,
  go,
}: {
  step: Step;
  go: (s: Step) => void;
}) {
  const back: Partial<Record<Step, Step>> = {
    property: "landing",
    tenure: "property",
    heating: "tenure",
    epc: "heating",
    benefits: "epc",
    postcode: "benefits",
    contact: "result",
  };
  const target = back[step];
  if (!target) return null;
  return (
    <div className="mx-auto max-w-6xl px-5 pt-5">
      <button
        type="button"
        onClick={() => go(target)}
        aria-label="Back"
        data-testid="grant-back"
        className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 pl-2.5 pr-3.5 py-1.5 text-[12.5px] font-extrabold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back
      </button>
    </div>
  );
}

function Spinner({ small }: { small?: boolean }) {
  const size = small ? 14 : 44;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      style={{ animation: "vmbSpin 1s linear infinite" }}
      className="inline-block"
      aria-hidden
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="#d1fae5"
        strokeWidth="5"
      />
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="#059669"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="40 100"
      />
      <style jsx>{`
        @keyframes vmbSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </svg>
  );
}

/* ====================================================================
   SELECT TILE - modern radio replacement
   No right-side circle. Selected = emerald border + soft glow + check
   medallion at top-right corner of the card.
   ==================================================================== */

function SelectTile({
  label,
  sub,
  selected,
  onClick,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-2xl px-4 py-4 transition-all duration-200 ${
        selected
          ? "bg-white shadow-[0_8px_30px_-6px_rgba(16,185,129,0.35)]"
          : "bg-white hover:-translate-y-0.5 hover:shadow-md"
      }`}
      style={{
        border: selected ? "2px solid #10b981" : "1.5px solid #e2e8f0",
      }}
    >
      <div className="pr-7">
        <div className="text-[14.5px] font-extrabold text-slate-900 leading-tight">
          {label}
        </div>
        {sub && (
          <div className="mt-1 text-[12px] text-slate-500 leading-snug">
            {sub}
          </div>
        )}
      </div>

      {/* Top-right corner: empty space when not selected, check medallion
          when selected. No empty circle - cleaner unselected state. */}
      <div className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center">
        {selected ? (
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[12px] font-black shadow-md"
            style={{
              background: "linear-gradient(135deg,#10b981,#047857)",
              boxShadow: "0 4px 10px rgba(5,150,105,0.45)",
            }}
            aria-hidden
          >
            ✓
          </span>
        ) : (
          <span className="block w-2 h-2 rounded-full bg-slate-200 group-hover:bg-emerald-300 transition-colors" />
        )}
      </div>
    </button>
  );
}

/* ====================================================================
   HEADER BADGE - replaces the plain "INSULATION GRANT CHECK" text
   ==================================================================== */

function TrustDivider() {
  return (
    <div
      aria-hidden
      className="self-stretch w-px bg-emerald-300/25"
    />
  );
}

function TrustPillar({
  label,
  sub,
  icon,
}: {
  label: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center w-[76px] sm:w-[88px]">
      <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-full ring-1 ring-emerald-300/45 flex items-center justify-center text-emerald-200">
        {icon}
      </span>
      <div className="mt-2 text-[11.5px] sm:text-[12px] font-extrabold text-emerald-100 leading-tight">
        {label}
      </div>
      {sub && (
        <div className="text-[10px] sm:text-[10.5px] font-medium text-emerald-200/70 leading-tight mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

function HeaderBadge({ active }: { active: number | null }) {
  // Compact on mobile (just "2/6" inside the pill) during questions so
  // the wordmark has room. Outside the question flow (landing, result,
  // contact, confirmation) the mobile badge is hidden entirely - the
  // page hero / screen heading already tells the user where they are.
  return (
    <div
      className={`items-center gap-1.5 sm:gap-2 rounded-full px-2.5 py-1 sm:px-3 text-[10.5px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] sm:tracking-[0.14em] ring-1 whitespace-nowrap ${
        active != null ? "inline-flex" : "hidden sm:inline-flex"
      }`}
      style={{
        background: "rgba(16,185,129,0.12)",
        color: "#6ee7b7",
        borderColor: "rgba(110,231,183,0.35)",
        boxShadow: "inset 0 0 0 1px rgba(16,185,129,0.15)",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
        style={{ background: "#34d399" }}
      />
      {active != null ? (
        <>
          <span className="hidden sm:inline">
            Question {active} of {QUESTION_STEPS.length}
          </span>
          <span className="sm:hidden">
            {active}/{QUESTION_STEPS.length}
          </span>
        </>
      ) : (
        <span>Insulation grant check</span>
      )}
    </div>
  );
}

/* ====================================================================
   TRUST STRIP ILLUSTRATIONS - bespoke, not icon-font
   Each one a small flat scene tuned to its label.
   ==================================================================== */

function TrustBigBen() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden>
      {/* tower base */}
      <rect x="20" y="24" width="8" height="20" fill="#059669" />
      {/* clock face */}
      <rect x="18" y="14" width="12" height="10" rx="1.5" fill="#fff" stroke="#047857" strokeWidth="1.5" />
      <circle cx="24" cy="19" r="3" fill="#fbbf24" />
      <path d="M24 19 L24 17 M24 19 L25.6 19.7" stroke="#0f172a" strokeWidth="1" strokeLinecap="round" />
      {/* spire */}
      <path d="M24 14 L24 6" stroke="#059669" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="6" r="1.6" fill="#fbbf24" />
      {/* ground */}
      <rect x="14" y="42" width="20" height="2" fill="#a7f3d0" rx="0.5" />
    </svg>
  );
}

function TrustBadge() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden>
      {/* ribbon back */}
      <path d="M16 30 L12 44 L18 41 L24 44 L30 41 L36 44 L32 30 Z" fill="#fbbf24" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" />
      {/* coin */}
      <circle cx="24" cy="22" r="13" fill="#10b981" />
      <circle cx="24" cy="22" r="13" fill="none" stroke="#047857" strokeWidth="2" />
      <path d="M18 23 L22 27 L30 18" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* shine */}
      <path d="M18 14 Q24 12 30 14" stroke="#a7f3d0" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function TrustVault() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden>
      {/* vault body */}
      <rect x="8" y="12" width="32" height="28" rx="3" fill="#0f172a" />
      <rect x="11" y="15" width="26" height="22" rx="2" fill="#064e3b" />
      {/* dial */}
      <circle cx="24" cy="26" r="7" fill="#10b981" />
      <circle cx="24" cy="26" r="3" fill="#0f172a" />
      {/* handle */}
      <rect x="22" y="24" width="4" height="4" fill="#a7f3d0" rx="0.5" />
      <path d="M24 18 L24 20 M24 32 L24 34 M18 26 L20 26 M28 26 L30 26" stroke="#a7f3d0" strokeWidth="1.4" strokeLinecap="round" />
      {/* feet */}
      <rect x="10" y="40" width="4" height="3" fill="#0f172a" />
      <rect x="34" y="40" width="4" height="3" fill="#0f172a" />
    </svg>
  );
}

function TrustMap() {
  return (
    <svg width="32" height="32" viewBox="0 0 48 48" aria-hidden>
      {/* map back - folded paper */}
      <path d="M6 12 L18 8 L30 12 L42 8 L42 38 L30 42 L18 38 L6 42 Z" fill="#fef3c7" stroke="#b45309" strokeWidth="1" strokeLinejoin="round" />
      <path d="M18 8 L18 38 M30 12 L30 42" stroke="#b45309" strokeWidth="0.8" opacity="0.5" />
      {/* roads */}
      <path d="M10 30 Q20 24 30 28 T40 22" stroke="#92400e" strokeWidth="1.2" fill="none" opacity="0.5" />
      {/* pin */}
      <path d="M24 14 C 28 14 30 17 30 20 C 30 24 24 30 24 30 C 24 30 18 24 18 20 C 18 17 20 14 24 14 Z" fill="#10b981" stroke="#047857" strokeWidth="1" />
      <circle cx="24" cy="20" r="2.2" fill="#fff" />
    </svg>
  );
}

/* ====================================================================
   CUSTOM ICONS - trust strip (legacy mono-line, kept for any reuse)
   Mono-line, currentColor stroke, 18px square.
   ==================================================================== */

const ICON: React.SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function CrownIcon() {
  return (
    <svg {...ICON}>
      <path d="M3 18h18" />
      <path d="M4 18l1.5-9 4 4 2.5-7 2.5 7 4-4L20 18" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...ICON}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 22s-7-7.6-7-13a7 7 0 1114 0c0 5.4-7 13-7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/* ====================================================================
   CUSTOM ILLUSTRATIONS - how-it-works grid
   Flat scenes (not pure outlines, not icons) so the 4-step row reads
   as a story, not a row of bullet markers. Each illustration uses
   2-3 shades of its step colour to feel custom rather than stock.
   ==================================================================== */

function IlloChecklist() {
  return (
    <svg width="80" height="64" viewBox="0 0 120 80" aria-hidden>
      {/* clipboard back */}
      <rect x="22" y="14" width="62" height="58" rx="6" fill="#10b981" />
      {/* paper */}
      <rect x="28" y="20" width="50" height="48" rx="3" fill="#ffffff" />
      {/* clip */}
      <rect x="45" y="10" width="16" height="8" rx="2" fill="#047857" />
      {/* check rows */}
      {[28, 38, 48].map((y, i) => (
        <g key={y}>
          <rect
            x="33"
            y={y}
            width="10"
            height="10"
            rx="2"
            fill={i < 2 ? "#a7f3d0" : "#f1f5f9"}
            stroke="#10b981"
            strokeWidth="1.4"
          />
          {i < 2 && (
            <path
              d={`M35 ${y + 5} L38 ${y + 8} L42 ${y + 3}`}
              stroke="#047857"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          <rect x="46" y={y + 3} width={i === 0 ? 24 : i === 1 ? 18 : 22} height="4" rx="2" fill="#cbd5e1" />
        </g>
      ))}
      {/* tiny cursor */}
      <path d="M88 50 L96 56 L92 58 L94 64 L92 65 L90 59 L86 60 Z" fill="#0f172a" />
    </svg>
  );
}

function IlloVerdict() {
  return (
    <svg width="80" height="64" viewBox="0 0 120 80" aria-hidden>
      {/* gauge arc */}
      <path
        d="M20 60 A 40 40 0 0 1 100 60"
        fill="none"
        stroke="#e0f2fe"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M20 60 A 40 40 0 0 1 84 30"
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* needle */}
      <circle cx="60" cy="60" r="5" fill="#0f172a" />
      <path d="M60 60 L78 36" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      {/* badge */}
      <circle cx="92" cy="22" r="12" fill="#0ea5e9" />
      <path
        d="M86 22 L90 26 L98 18"
        stroke="#ffffff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IlloSurvey() {
  return (
    <svg width="80" height="64" viewBox="0 0 120 80" aria-hidden>
      {/* house */}
      <path d="M14 68 L48 38 L82 68 L82 76 L14 76 Z" fill="#c4b5fd" />
      <path d="M18 68 L48 42 L78 68" fill="none" stroke="#7c3aed" strokeWidth="2" />
      <rect x="40" y="56" width="14" height="20" fill="#7c3aed" />
      <rect x="58" y="56" width="12" height="10" fill="#ffffff" stroke="#7c3aed" strokeWidth="1.5" />
      {/* surveyor figure */}
      <circle cx="96" cy="42" r="7" fill="#8b5cf6" />
      <rect x="91" y="50" width="10" height="14" rx="3" fill="#8b5cf6" />
      <rect x="89" y="64" width="4" height="12" rx="1.5" fill="#8b5cf6" />
      <rect x="99" y="64" width="4" height="12" rx="1.5" fill="#8b5cf6" />
      {/* clipboard in hand */}
      <rect x="100" y="56" width="12" height="14" rx="2" fill="#ffffff" stroke="#5b21b6" strokeWidth="1.4" />
      <path d="M103 60 L109 60 M103 64 L107 64" stroke="#5b21b6" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IlloInstall() {
  return (
    <svg width="80" height="64" viewBox="0 0 120 80" aria-hidden>
      {/* house silhouette */}
      <path d="M20 68 L60 32 L100 68 L100 76 L20 76 Z" fill="#fef3c7" />
      <path d="M24 68 L60 36 L96 68" fill="none" stroke="#b45309" strokeWidth="2" />
      {/* insulation panels - 3 thermal layers */}
      <path d="M30 70 L60 42 L90 70" fill="none" stroke="#fbbf24" strokeWidth="2.5" opacity="0.85" />
      <path d="M36 72 L60 48 L84 72" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.7" />
      {/* door + window */}
      <rect x="54" y="56" width="12" height="20" fill="#92400e" />
      <rect x="72" y="56" width="12" height="10" fill="#fff7ed" stroke="#b45309" strokeWidth="1.5" />
      {/* cosy sparkles */}
      <g stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
        <path d="M16 22 L16 30 M12 26 L20 26" />
        <path d="M102 18 L102 24 M99 21 L105 21" />
        <path d="M44 14 L44 20 M41 17 L47 17" opacity="0.7" />
      </g>
    </svg>
  );
}
