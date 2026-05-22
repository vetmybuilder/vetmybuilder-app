// web/pages/projects/[id]/recommend.tsx
import Head from "next/head";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import Layout from "@/components/Layout";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";
import RecommendMobile from "@/components/recommend/RecommendMobile";
import BrandWatermarkScatter from "@/components/BrandWatermarkScatter";
import { ChevronLeft, Sparkles, Star, ThumbsUp } from "lucide-react";
import {
  RATING_CATEGORIES,
  StarRow,
} from "@/components/ratings/StarRatingList";

type Project = {
  id: number;
  name: string;
  location: string;
  status: string;
  ownerUserId: string;
};

function Banner({
  kind,
  children,
  focusRef,
}: {
  kind: "success" | "error" | "info";
  children: any;
  focusRef?: any;
}) {
  const styles =
    kind === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : kind === "error"
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-amber-50 border-amber-200 text-amber-800";

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className={`rounded-2xl border-2 px-4 py-3 text-sm font-medium ${styles} outline-none`}
    >
      {children}
    </div>
  );
}

type FieldKey =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "companyEmail"
  | "comment";

type FieldErrors = Partial<Record<FieldKey, string>>;

const isValidEmail = (s: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

type AnonymousRecommendationTracking = {
  recommendationId: number;
  projectId: number;
  projectName: string;
  submittedAt: string;
  name: string;
  email?: string;
  company: string;
};

const ANON_RECOMMENDATIONS_KEY = "vmb:anonRecommendations";

const inputClass =
  "w-full bg-amber-50/40 rounded-2xl border-[1.5px] border-amber-100 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none transition-colors";
const inputErrorClass =
  "w-full bg-amber-50/40 rounded-2xl border-[1.5px] border-rose-400 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-rose-500 focus:bg-white focus:outline-none transition-colors";
const labelClass =
  "block text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-2";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <span className="flex-1 h-px bg-amber-100" />
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700">
        {children}
      </h2>
      <span className="flex-1 h-px bg-amber-100" />
    </div>
  );
}

function RecommendIllustration() {
  return (
    <div className="relative w-full max-w-[420px] mx-auto" aria-hidden>
      <Sparkles
        className="absolute top-1 left-4 w-6 h-6 text-amber-400/80"
        strokeWidth={2.5}
      />
      <Sparkles
        className="absolute top-28 -right-2 w-8 h-8 text-amber-400/80"
        strokeWidth={2.5}
      />
      <Sparkles
        className="absolute bottom-8 left-0 w-7 h-7 text-amber-400/70"
        strokeWidth={2.5}
      />

      <div className="relative pt-10 pb-14">
        <div className="absolute top-0 right-2 w-64 bg-white border-2 border-amber-100 rounded-3xl p-5 shadow-xl -rotate-[6deg]">
          <div className="flex gap-0.5 mb-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className="w-4 h-4 fill-amber-400 text-amber-400"
              />
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-amber-50 rounded-full w-full" />
            <div className="h-2 bg-amber-50 rounded-full w-4/5" />
          </div>
        </div>

        <div className="relative w-80 bg-white border-2 border-amber-100 rounded-3xl p-6 shadow-2xl rotate-[3deg] mt-24">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-xs"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #6366f1, #4f46e5)",
              }}
            >
              JR
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-2.5 bg-slate-900 rounded-full w-28" />
              <div className="h-2 bg-slate-200 rounded-full w-20" />
            </div>
          </div>

          <div className="flex gap-0.5 mb-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className="w-5 h-5 fill-amber-400 text-amber-400"
              />
            ))}
          </div>

          <div className="space-y-2 mb-4">
            <div className="h-2.5 bg-amber-50 rounded-full w-full" />
            <div className="h-2.5 bg-amber-50 rounded-full w-5/6" />
            <div className="h-2.5 bg-amber-50 rounded-full w-2/3" />
          </div>

          <div className="flex gap-2">
            <div className="w-12 h-10 rounded-lg bg-amber-100" />
            <div className="w-12 h-10 rounded-lg bg-indigo-100" />
            <div className="w-12 h-10 rounded-lg bg-rose-100" />
          </div>
        </div>

        <div
          className="absolute bottom-2 right-2 w-20 h-20 rounded-full shadow-2xl flex items-center justify-center rotate-[8deg]"
          style={{
            backgroundImage: "linear-gradient(135deg, #6366f1, #4f46e5)",
            boxShadow: "0 18px 40px rgba(99,102,241,0.35)",
          }}
        >
          <ThumbsUp
            className="w-9 h-9 text-white"
            fill="white"
            strokeWidth={2}
          />
        </div>
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      data-testid={id}
      className="mt-1.5 text-xs font-semibold text-red-600"
    >
      {message}
    </p>
  );
}

export default function RecommendOnPlatform() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<File[]>([]);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    companyEmail: "",
    comment: "",
  });
  // Per-category star ratings collected on the mobile wizard's Step 1.
  // 0 = un-rated. Sent through to the API alongside the existing fields.
  const [ratings, setRatings] = useState({
    quality: 0,
    reliability: 0,
    communication: 0,
    trust: 0,
    value: 0,
  });
  const setRating = (k: keyof typeof ratings, value: number) =>
    setRatings((prev) => ({ ...prev, [k]: value }));
  const [lockIdentity, setLockIdentity] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const prefilledRef = useRef(false);

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        setProject(data.project);
      } catch (e: any) {
        setPageError(e?.response?.data?.error || "Failed to load project");
      } finally {
        setLoading(false);
      }
    })();
  }, [api, id]);

  useEffect(() => {
    if (authLoading || loading || !project) return;

    if (user && project.ownerUserId === user.uid) {
      router.replace(`/projects/${project.id}`);
      return;
    }

    if (user) {
      (async () => {
        try {
          const { data } = await api.get("/api/tradesmen/me");
          if (data?.role === "tradesman" || !!data?.profile) {
            // Skip the intermediate /projects/[id] hop - that page
            // itself bounces tradesmen to /tradesman/jobs, so going
            // there first means the user briefly sees the homeowner
            // project view (and its pay-gate) before the second
            // redirect lands.
            router.replace("/tradesman/jobs");
            return;
          }
        } catch {}
        setAllowed(true);
      })();
    } else {
      setAllowed(true);
    }
  }, [authLoading, loading, user, project, api, router]);

  useEffect(() => {
    if (authLoading || prefilledRef.current) return;

    if (user) {
      (async () => {
        try {
          const me = await api.get("/api/me");
          const email: string = me?.data?.email ?? me?.data?.user?.email ?? "";
          const first: string = me?.data?.firstName ?? me?.data?.user?.firstName ?? "";
          const last: string = me?.data?.lastName ?? me?.data?.user?.lastName ?? "";
          const fullName = [first, last].filter(Boolean).join(" ");

          setForm((f) => ({
            ...f,
            name: f.name || fullName,
            email: f.email || email,
          }));

          setLockIdentity(Boolean(fullName || email));
          prefilledRef.current = true;
        } catch {
          setLockIdentity(false);
        }
      })();
    }
  }, [authLoading, user, api]);

  const set = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key as FieldKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key as FieldKey];
        return next;
      });
    }
  };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.name.trim()) errs.name = "Please enter your name.";
    if (form.email.trim() && !isValidEmail(form.email)) errs.email = "Please enter a valid email address.";
    if (!form.company.trim()) errs.company = "Please enter the company name.";
    if (form.companyEmail.trim() && !isValidEmail(form.companyEmail)) errs.companyEmail = "Please enter a valid email address.";
    // Comment is optional. Only validate the upper bound if the user typed
    // something - empty / short blanks pass through and the row stores NULL.
    if (form.comment.trim().length > 2000) {
      errs.comment = "Comment is too long (max 2000 characters).";
    }
    return errs;
  };

  const focusFirstError = (errs: FieldErrors) => {
    const order: FieldKey[] = ["name", "email", "company", "companyEmail", "phone", "comment"];
    const first = order.find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(`recommend-${kebab(first)}`);
    if (el && typeof (el as HTMLInputElement).focus === "function") {
      (el as HTMLInputElement).focus();
    }
  };

  const kebab = (k: FieldKey): string =>
    k === "companyEmail" ? "company-email" : k;

  const trackAnonymousRecommendation = (recommendationId: number) => {
    if (user || !project) return;
    const entry: AnonymousRecommendationTracking = {
      recommendationId,
      projectId: project.id,
      projectName: project.name,
      submittedAt: new Date().toISOString(),
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      company: form.company.trim(),
    };
    try {
      const raw = localStorage.getItem(ANON_RECOMMENDATIONS_KEY);
      const existing: AnonymousRecommendationTracking[] = raw ? JSON.parse(raw) : [];
      const next = [entry, ...existing.filter((item) => item.recommendationId !== entry.recommendationId)].slice(0, 20);
      localStorage.setItem(ANON_RECOMMENDATIONS_KEY, JSON.stringify(next));
      sessionStorage.setItem("vmb:returnTo", `/projects/${project.id}`);
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setFormError(null);
      focusFirstError(errs);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const rating = 5;
      let recommendationId: number | undefined;

      // Mobile wizard collects 5 category ratings (1-5). Desktop leaves them
      // 0 so we send them as undefined when the user didn't rate that one.
      const ratingFields: Record<string, number | undefined> = {
        qualityRating: ratings.quality > 0 ? ratings.quality : undefined,
        reliabilityRating:
          ratings.reliability > 0 ? ratings.reliability : undefined,
        communicationRating:
          ratings.communication > 0 ? ratings.communication : undefined,
        trustRating: ratings.trust > 0 ? ratings.trust : undefined,
        valueRating: ratings.value > 0 ? ratings.value : undefined,
      };

      if (photos.length > 0) {
        const fd = new FormData();
        fd.set("name", form.name);
        if (form.email) fd.set("email", form.email);
        if (form.phone) fd.set("phone", form.phone);
        fd.set("company", form.company);
        if (form.companyEmail) fd.set("companyEmail", form.companyEmail);
        fd.set("rating", String(rating));
        fd.set("comment", form.comment);
        for (const [k, v] of Object.entries(ratingFields)) {
          if (typeof v === "number") fd.set(k, String(v));
        }
        photos.forEach((file) => fd.append("photos", file));
        const { data } = await api.post(`/api/projects/${id}/recommendations`, fd);
        recommendationId = data?.recommendationId;
      } else {
        const { data } = await api.post(`/api/projects/${id}/recommendations`, {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          company: form.company,
          companyEmail: form.companyEmail || undefined,
          rating,
          comment: form.comment,
          ...ratingFields,
        });
        recommendationId = data?.recommendationId;
      }

      if (!recommendationId) throw new Error("Could not save recommendation");

      // recommendation_made event captured server-side in recommendations.post.js.
      trackAnonymousRecommendation(recommendationId);
      setNotice(
        `Thanks! Your recommendation for ${form.company.trim()} has been sent.`,
      );
      setTimeout(() => successRef.current?.focus(), 0);

      try {
        await api.post(`/api/recommendations/${recommendationId}/like`);
      } catch {}

      // Give the user time to read the success state before redirecting.
      // Mobile renders this as a full-screen success view; desktop keeps the
      // existing inline banner. 2.5s lands somewhere between "I saw it" and
      // "I'm waiting".
      setTimeout(() => {
        if (!user) {
          router.replace("/");
        } else {
          router.replace(`/projects/${id}`);
        }
      }, 2500);
    } catch (e: any) {
      const issues: any[] | undefined = e?.response?.data?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        const apiErrs: FieldErrors = {};
        for (const issue of issues) {
          const path = Array.isArray(issue?.path) ? issue.path[0] : null;
          if (typeof path !== "string") continue;
          const friendly = issue?.message === "Invalid email" ? "Please enter a valid email address." : issue?.message || "Invalid value.";
          if (["name", "email", "phone", "company", "companyEmail", "comment"].includes(path)) {
            apiErrs[path as FieldKey] = friendly;
          }
        }
        if (Object.keys(apiErrs).length > 0) {
          setFieldErrors(apiErrs);
          focusFirstError(apiErrs);
          return;
        }
      }
      setFormError(e?.response?.data?.error || e?.message || "Failed to submit recommendation");
      setTimeout(() => errorRef.current?.focus(), 0);
      setSubmitting(false);
    }
  };

  const isProjectUnavailable = !loading && !!pageError && !project;

  // Until the access check resolves we don't know whether this viewer
  // is a homeowner, a guest, or a tradesman being bounced back to
  // /tradesman/jobs. Rendering the full page chrome (Layout, cream
  // backdrop, watermark, "Back" link, loading cards) for the half-
  // second the trade check is in flight produced a visible flash of
  // the recommend UI before the redirect landed. Bail to a neutral
  // full-screen shell instead so the tradesman never sees the
  // homeowner-only page even for a frame. The unavailable-project
  // state has its own copy and stays rendered as a real result.
  const accessCheckPending = allowed !== true && !isProjectUnavailable;
  if (accessCheckPending) {
    return (
      <>
        <Head>
          <title>Recommend a tradesperson - VetMyBuilder</title>
        </Head>
        <div
          className="fixed inset-0 flex items-center justify-center bg-[#fef6e9]"
          data-testid="recommend-access-checking"
        >
          <div className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-500">
            <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
            Loading…
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Recommend a tradesperson - VetMyBuilder</title>
      </Head>

      {/* MOBILE - bare V1 single-page form. Shares state with the desktop
          branch via the same closure variables (form, set, submit, etc.). */}
      <div className="md:hidden">
        {allowed === true && project && (
          <RecommendMobile
            projectName={project.name}
            authed={!!user}
            form={form}
            fieldErrors={fieldErrors}
            formError={formError}
            notice={notice}
            submitting={submitting}
            photos={photos}
            photoConsent={photoConsent}
            lockIdentity={lockIdentity}
            ratings={ratings}
            setRating={setRating}
            set={set as any}
            setPhotos={setPhotos}
            setPhotoConsent={setPhotoConsent}
            onSubmit={submit}
          />
        )}
        {!isProjectUnavailable && !project && (
          <div className="px-6 py-10 text-sm text-gray-500" data-testid="recommend-loading">
            Loading…
          </div>
        )}
        {isProjectUnavailable && (
          <div className="px-6 py-10 text-center" data-testid="recommend-project-unavailable">
            <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl">
              🔒
            </div>
            <h1 className="text-[20px] font-extrabold tracking-tight text-gray-900">
              This project isn&apos;t accepting recommendations
            </h1>
            <p className="mt-2 text-[13px] text-gray-500 leading-relaxed">
              The project may have been closed, archived, or might not exist.
              Double-check the link from the person who shared it with you.
            </p>
            <a
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-rose-500 px-6 py-3 text-[14px] font-bold text-white shadow-lg shadow-rose-500/25"
              data-testid="recommend-unavailable-home"
            >
              Back to homepage
            </a>
          </div>
        )}
      </div>

      {/* DESKTOP - cream backdrop, indigo chrome, brand watermark scatter
          behind. Single-page form with the 5 star ratings from the mobile
          wizard surfaced as a section. */}
      <div className="hidden md:block">
        <Head>
          <style>{`body { background: #fef6e9 !important; }`}</style>
        </Head>
        <Layout>
          <div className="bg-[#fef6e9] min-h-screen -mt-14 pt-14 pb-10 relative overflow-hidden">
            <BrandWatermarkScatter />
            <div className="relative z-10 mx-auto max-w-[1180px] px-6 pt-4">
              {/* Back destination depends on who's looking. The
                  recommend page is publicly shareable, so a guest who
                  follows the link from a friend has no business landing
                  on the homeowner-only /projects/{id} view (which then
                  bounces them again to /projects → /login, flashing
                  intermediate chrome each hop). Only the project owner
                  goes back to their own project page; everyone else
                  goes home. */}
              <a
                href={
                  user && project && project.ownerUserId === user.uid
                    ? `/projects/${project.id}`
                    : "/"
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 shadow-sm px-4 py-2.5 text-[13.5px] font-bold text-gray-800 hover:bg-gray-50 hover:border-gray-300 active:scale-[0.98] transition-all mb-4"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </a>

              <div className="lg:grid lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)] lg:gap-12 lg:items-start">
                <div>
              {!isProjectUnavailable && !project && (
                <div
                  className="bg-white rounded-3xl border border-amber-100 shadow-sm p-8 text-center"
                  data-testid="recommend-loading"
                >
                  <p className="text-sm font-medium text-zinc-500">Loading...</p>
                </div>
              )}

              {isProjectUnavailable && (
                <div
                  className="bg-white rounded-3xl border border-amber-100 shadow-sm p-10 text-center"
                  data-testid="recommend-project-unavailable"
                >
                  <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
                    {"\u{1F512}"}
                  </div>
                  <h1
                    className="text-2xl font-black tracking-tight text-slate-900"
                    style={{ fontFamily: "'Sora', sans-serif" }}
                  >
                    This project isn&apos;t accepting recommendations
                  </h1>
                  <p className="mt-3 text-sm text-zinc-500">
                    The project may have been closed, archived, or might not
                    exist. Double-check the link from the person who shared
                    it with you.
                  </p>
                  <div className="mt-6">
                    <a
                      href="/"
                      className="inline-flex items-center justify-center rounded-full text-white px-6 py-3 text-sm font-bold shadow-md shadow-indigo-500/30 hover:brightness-110 transition"
                      style={{
                        backgroundImage:
                          "linear-gradient(135deg, #6366f1, #4f46e5)",
                      }}
                    >
                      Back to homepage
                    </a>
                  </div>
                </div>
              )}

              {allowed === true && project && (
                <div className="bg-white rounded-3xl border border-amber-100 shadow-sm p-8 md:p-10">
                  <div className="mb-7">
                    <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-700 mb-1.5">
                      Recommend a tradesperson
                    </div>
                    <h1
                      className="text-[28px] font-black tracking-tight text-slate-900 leading-tight"
                      style={{ fontFamily: "'Sora', sans-serif" }}
                    >
                      How did{" "}
                      <span
                        className="text-indigo-600"
                        style={{
                          fontFamily: "'Caveat', cursive",
                          fontSize: "118%",
                        }}
                      >
                        they
                      </span>{" "}
                      do?
                    </h1>
                    <p className="mt-2 text-sm text-zinc-500">
                      For &ldquo;{project.name}&rdquo;
                    </p>
                  </div>

                  {formError && (
                    <div className="mb-5">
                      <Banner kind="error" focusRef={errorRef}>
                        {formError}
                      </Banner>
                    </div>
                  )}

                  {notice && (
                    <div className="mb-5">
                      <Banner kind="success" focusRef={successRef}>
                        {notice}
                      </Banner>
                    </div>
                  )}

                  {!user && (
                    <div className="mb-5">
                      <Banner kind="info">
                        You can submit without an account - or{" "}
                        <a
                          href="/signup"
                          className="font-bold underline hover:text-amber-900"
                        >
                          sign up
                        </a>{" "}
                        later to track your recommendations.
                      </Banner>
                    </div>
                  )}

                  <form onSubmit={submit} noValidate className="space-y-6">
                    <SectionHeading>How did they do?</SectionHeading>
                    <p className="text-[12.5px] text-zinc-500 leading-relaxed -mt-2">
                      Tap a star for each. Tap the same star again to clear it.
                    </p>
                    <div className="space-y-2">
                      {RATING_CATEGORIES.map((cat) => (
                        <StarRow
                          key={cat.key}
                          label={cat.label}
                          value={ratings[cat.key]}
                          onChange={(n) => setRating(cat.key, n)}
                        />
                      ))}
                    </div>

                    <div>
                      <label htmlFor="recommend-comment" className={labelClass}>
                        Comment{" "}
                        <span className="font-normal text-zinc-400 normal-case tracking-normal">
                          optional
                        </span>
                      </label>
                      <textarea
                        id="recommend-comment"
                        data-testid="recommend-comment"
                        className={`${fieldErrors.comment ? inputErrorClass : inputClass} min-h-28 resize-none`}
                        value={form.comment}
                        onChange={(e) => set("comment", e.target.value)}
                        placeholder="They did our bathroom last year. Tidy team, communicated well, came in under quote."
                        aria-invalid={!!fieldErrors.comment}
                        aria-describedby={
                          fieldErrors.comment ? "recommend-comment-error" : undefined
                        }
                      />
                      <FieldError
                        id="recommend-comment-error"
                        message={fieldErrors.comment}
                      />
                    </div>

                    <SectionHeading>Tradesperson&apos;s details</SectionHeading>
                    <div>
                      <label htmlFor="recommend-company" className={labelClass}>
                        Tradesperson&apos;s name
                      </label>
                      <input
                        id="recommend-company"
                        data-testid="recommend-company"
                        className={
                          fieldErrors.company ? inputErrorClass : inputClass
                        }
                        value={form.company}
                        onChange={(e) => set("company", e.target.value)}
                        placeholder="e.g. Sparkle Bathrooms Ltd"
                        aria-invalid={!!fieldErrors.company}
                        aria-describedby={
                          fieldErrors.company ? "recommend-company-error" : undefined
                        }
                      />
                      <FieldError
                        id="recommend-company-error"
                        message={fieldErrors.company}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="recommend-company-email"
                        className={labelClass}
                      >
                        Tradesperson&apos;s email{" "}
                        <span className="font-normal text-zinc-400 normal-case tracking-normal">
                          optional
                        </span>
                      </label>
                      <input
                        id="recommend-company-email"
                        data-testid="recommend-company-email"
                        className={
                          fieldErrors.companyEmail ? inputErrorClass : inputClass
                        }
                        type="email"
                        value={form.companyEmail}
                        onChange={(e) => set("companyEmail", e.target.value)}
                        placeholder="hello@company.co.uk"
                        aria-invalid={!!fieldErrors.companyEmail}
                        aria-describedby={
                          fieldErrors.companyEmail
                            ? "recommend-company-email-error"
                            : undefined
                        }
                      />
                      {fieldErrors.companyEmail ? (
                        <FieldError
                          id="recommend-company-email-error"
                          message={fieldErrors.companyEmail}
                        />
                      ) : (
                        <p className="mt-1.5 text-xs text-zinc-500">
                          We may use this to contact them about jobs.
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="recommend-phone" className={labelClass}>
                        Tradesperson&apos;s number{" "}
                        <span className="font-normal text-zinc-400 normal-case tracking-normal">
                          optional
                        </span>
                      </label>
                      <input
                        id="recommend-phone"
                        data-testid="recommend-phone"
                        className={fieldErrors.phone ? inputErrorClass : inputClass}
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                        inputMode="tel"
                        placeholder="07700 900 000"
                        aria-invalid={!!fieldErrors.phone}
                        aria-describedby={
                          fieldErrors.phone ? "recommend-phone-error" : undefined
                        }
                      />
                      <FieldError
                        id="recommend-phone-error"
                        message={fieldErrors.phone}
                      />
                    </div>

                    <SectionHeading>Photos of their work</SectionHeading>
                    <p className="text-[12.5px] text-zinc-500 leading-relaxed -mt-2">
                      Optional - add any recent work they did for you to help
                      the homeowner see what they&apos;re capable of.
                    </p>
                    <FileGridUploader
                      files={photos}
                      onChange={setPhotos}
                      maxFiles={8}
                      maxSizeMB={10}
                      onConsentChange={setPhotoConsent}
                    />

                    <SectionHeading>Your details</SectionHeading>
                    <div>
                      <label htmlFor="recommend-name" className={labelClass}>
                        Your name
                      </label>
                      <input
                        id="recommend-name"
                        data-testid="recommend-name"
                        className={`${fieldErrors.name ? inputErrorClass : inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                        disabled={lockIdentity}
                        placeholder="e.g. Alex Chan"
                        aria-invalid={!!fieldErrors.name}
                        aria-describedby={
                          fieldErrors.name ? "recommend-name-error" : undefined
                        }
                      />
                      <FieldError
                        id="recommend-name-error"
                        message={fieldErrors.name}
                      />
                    </div>

                    <div>
                      <label htmlFor="recommend-email" className={labelClass}>
                        Your email{" "}
                        <span className="font-normal text-zinc-400 normal-case tracking-normal">
                          optional
                        </span>
                      </label>
                      <input
                        id="recommend-email"
                        data-testid="recommend-email"
                        className={`${fieldErrors.email ? inputErrorClass : inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        disabled={lockIdentity}
                        placeholder="alex@example.com"
                        aria-invalid={!!fieldErrors.email}
                        aria-describedby={
                          fieldErrors.email ? "recommend-email-error" : undefined
                        }
                      />
                      <FieldError
                        id="recommend-email-error"
                        message={fieldErrors.email}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submitting || (photos.length > 0 && !photoConsent)
                      }
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-extrabold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundImage: submitting
                          ? "linear-gradient(135deg, #94a3b8, #64748b)"
                          : "linear-gradient(135deg, #6366f1, #4f46e5)",
                        boxShadow: submitting
                          ? undefined
                          : "0 8px 22px rgba(99,102,241,0.3)",
                      }}
                      title={
                        photos.length > 0 && !photoConsent
                          ? "Please confirm the photo upload consent before submitting."
                          : undefined
                      }
                    >
                      {submitting && (
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
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
                      )}
                      {submitting ? "Sending..." : "Send recommendation"}
                    </button>
                  </form>
                </div>
              )}
                </div>

                {allowed === true && project && (
                  <div className="hidden lg:block lg:sticky lg:top-24 lg:pt-8">
                    <RecommendIllustration />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Layout>
      </div>
    </>
  );
}
