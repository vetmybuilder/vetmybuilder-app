// web/pages/projects/[id]/recommend.tsx
import Head from "next/head";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import Layout from "@/components/Layout";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";
import RecommendMobile from "@/components/recommend/RecommendMobile";
import { trackRecommendationMade } from "@/utils/analytics";

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

const inputClass = "w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors";
const inputErrorClass = "w-full rounded-2xl border-2 border-red-400 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-500 focus:outline-none transition-colors";
const labelClass = "block text-sm font-bold text-zinc-900 mb-2";

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
            router.replace(`/projects/${project.id}`);
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

      trackRecommendationMade(Number(id), form.company);
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

      {/* DESKTOP - unchanged, wrapped in Layout because the route is now bare */}
      <div className="hidden md:block">
      <Layout>
      <div className="relative min-h-screen overflow-x-hidden -mt-14">
        {/* Builder background - matches the project detail page */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1600&q=80&auto=format"
            alt=""
            className="h-full w-full object-cover"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-stone-900/60" />
        </div>

        <div className="relative z-10 mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pt-20 pb-10">

          {!isProjectUnavailable && !project && (
            <div
              className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 text-center"
              data-testid="recommend-loading"
            >
              <p className="text-sm font-medium text-zinc-500">Loading…</p>
            </div>
          )}

          {isProjectUnavailable && (
            <div
              className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-8 sm:p-10 text-center"
              data-testid="recommend-project-unavailable"
            >
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
                🔒
              </div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">
                This project isn&apos;t accepting recommendations
              </h1>
              <p className="mt-3 text-sm text-zinc-500">
                The project may have been closed, archived, or might not exist.
                Double-check the link from the person who shared it with you.
              </p>
              <div className="mt-6">
                <a
                  href="/"
                  className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all"
                  data-testid="recommend-unavailable-home"
                >
                  Back to homepage
                </a>
              </div>
            </div>
          )}

          {allowed === true && project && (
            <div className="bg-white/95 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 md:p-10">
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">
                  Recommend a tradesperson
                </h1>
                <p className="mt-2 text-sm text-zinc-500">
                  For &ldquo;{project.name}&rdquo;
                </p>
              </div>

              {formError && (
                <div className="mb-5">
                  <Banner kind="error" focusRef={errorRef}>{formError}</Banner>
                </div>
              )}

              {notice && (
                <div className="mb-5">
                  <Banner kind="success" focusRef={successRef}>{notice}</Banner>
                </div>
              )}

              {!user && (
                <div className="mb-5">
                  <Banner kind="info">
                    You can submit without an account - or{" "}
                    <a href="/signup" className="font-bold underline hover:text-amber-900">sign up</a>{" "}
                    later to track your recommendations.
                  </Banner>
                </div>
              )}

              <form onSubmit={submit} noValidate className="space-y-5">
                <div className="flex items-center gap-3 pb-1">
                  <span className="flex-1 h-px bg-zinc-200" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Your details
                  </h2>
                  <span className="flex-1 h-px bg-zinc-200" />
                </div>
                <div>
                  <label htmlFor="recommend-name" className={labelClass}>Your name</label>
                  <input
                    id="recommend-name"
                    data-testid="recommend-name"
                    className={`${fieldErrors.name ? inputErrorClass : inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    disabled={lockIdentity}
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={fieldErrors.name ? "recommend-name-error" : undefined}
                  />
                  <FieldError id="recommend-name-error" message={fieldErrors.name} />
                </div>

                <div>
                  <label htmlFor="recommend-email" className={labelClass}>
                    Your email <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="recommend-email"
                    data-testid="recommend-email"
                    className={`${fieldErrors.email ? inputErrorClass : inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    disabled={lockIdentity}
                    aria-invalid={!!fieldErrors.email}
                    aria-describedby={fieldErrors.email ? "recommend-email-error" : undefined}
                  />
                  <FieldError id="recommend-email-error" message={fieldErrors.email} />
                </div>

                <div className="flex items-center gap-3 pt-3 pb-1">
                  <span className="flex-1 h-px bg-zinc-200" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Tradesperson&apos;s details
                  </h2>
                  <span className="flex-1 h-px bg-zinc-200" />
                </div>
                <div>
                  <label htmlFor="recommend-company" className={labelClass}>Tradesperson&apos;s name</label>
                  <input
                    id="recommend-company"
                    data-testid="recommend-company"
                    className={fieldErrors.company ? inputErrorClass : inputClass}
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                    aria-invalid={!!fieldErrors.company}
                    aria-describedby={fieldErrors.company ? "recommend-company-error" : undefined}
                  />
                  <FieldError id="recommend-company-error" message={fieldErrors.company} />
                </div>

                <div>
                  <label htmlFor="recommend-company-email" className={labelClass}>
                    Tradesperson&apos;s email <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="recommend-company-email"
                    data-testid="recommend-company-email"
                    className={fieldErrors.companyEmail ? inputErrorClass : inputClass}
                    type="email"
                    value={form.companyEmail}
                    onChange={(e) => set("companyEmail", e.target.value)}
                    placeholder="hello@company.co.uk"
                    aria-invalid={!!fieldErrors.companyEmail}
                    aria-describedby={fieldErrors.companyEmail ? "recommend-company-email-error" : undefined}
                  />
                  {fieldErrors.companyEmail ? (
                    <FieldError id="recommend-company-email-error" message={fieldErrors.companyEmail} />
                  ) : (
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Optional - we may use this to contact them about jobs.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="recommend-phone" className={labelClass}>
                    Tradesperson&apos;s number <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="recommend-phone"
                    data-testid="recommend-phone"
                    className={fieldErrors.phone ? inputErrorClass : inputClass}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    inputMode="tel"
                    aria-invalid={!!fieldErrors.phone}
                    aria-describedby={fieldErrors.phone ? "recommend-phone-error" : undefined}
                  />
                  <FieldError id="recommend-phone-error" message={fieldErrors.phone} />
                </div>

                <div>
                  <label className={labelClass}>
                    Photos of their work <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <p className="-mt-1 mb-2 text-xs text-zinc-500">
                    Add any recent work they did for you - helps the homeowner
                    see what they&apos;re capable of.
                  </p>
                  <FileGridUploader
                    files={photos}
                    onChange={setPhotos}
                    maxFiles={8}
                    maxSizeMB={10}
                    onConsentChange={setPhotoConsent}
                  />
                </div>

                <div>
                  <label htmlFor="recommend-comment" className={labelClass}>
                    Comment <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <textarea
                    id="recommend-comment"
                    data-testid="recommend-comment"
                    className={`${fieldErrors.comment ? inputErrorClass : inputClass} min-h-32 resize-none`}
                    value={form.comment}
                    onChange={(e) => set("comment", e.target.value)}
                    aria-invalid={!!fieldErrors.comment}
                    aria-describedby={fieldErrors.comment ? "recommend-comment-error" : undefined}
                  />
                  <FieldError id="recommend-comment-error" message={fieldErrors.comment} />
                </div>

                <button
                  type="submit"
                  disabled={submitting || (photos.length > 0 && !photoConsent)}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-8 py-4 text-base font-bold text-white shadow-lg transition-all ${
                    submitting ? "bg-zinc-400 cursor-not-allowed shadow-none" : "bg-red-500 shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] active:scale-95"
                  } disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100`}
                  title={photos.length > 0 && !photoConsent ? "Please confirm the photo upload consent before submitting." : undefined}
                >
                  {submitting && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                  )}
                  {submitting ? "Sending..." : "Send"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
      </Layout>
      </div>
    </>
  );
}
