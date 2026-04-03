// web/pages/projects/[id]/recommend.tsx
import Head from "next/head";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";
import FileGridUploader from "@/components/fileUpload/FileGridUploader";

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
const labelClass = "block text-sm font-bold text-zinc-900 mb-2";

export default function RecommendOnPlatform() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<File[]>([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    hireAgain: "yes" as "yes" | "no",
    comment: "",
  });
  const [lockIdentity, setLockIdentity] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (authLoading || !project) return;

    if (user && project.ownerUserId === user.uid) {
      router.replace(`/projects/${project.id}`);
      return;
    }

    if (user) {
      (async () => {
        try {
          const { data } = await api.get("/api/tradesmen/me");
          if (data?.role === "tradesman") {
            router.replace(`/projects/${project.id}`);
          }
        } catch {}
      })();
    }
  }, [authLoading, user, project, api, router]);

  useEffect(() => {
    if (authLoading || prefilledRef.current) return;

    if (user) {
      (async () => {
        try {
          const me = await api.get("/api/me");

          const email: string = me?.data?.email ?? me?.data?.user?.email ?? "";
          const first: string =
            me?.data?.firstName ?? me?.data?.user?.firstName ?? "";
          const last: string =
            me?.data?.lastName ?? me?.data?.user?.lastName ?? "";

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

  const set = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    if (!form.name.trim()) return "Please enter your name.";
    if (!form.company.trim()) return "Please enter the company.";
    if (form.comment.trim().length < 10) {
      return "Comment should be at least 10 characters.";
    }
    return null;
  };

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
      const existing: AnonymousRecommendationTracking[] = raw
        ? JSON.parse(raw)
        : [];

      const next = [
        entry,
        ...existing.filter(
          (item) => item.recommendationId !== entry.recommendationId,
        ),
      ].slice(0, 20);

      localStorage.setItem(ANON_RECOMMENDATIONS_KEY, JSON.stringify(next));
      sessionStorage.setItem("vmb:returnTo", `/projects/${project.id}`);
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      const rating = form.hireAgain === "yes" ? 5 : 1;

      let recommendationId: number | undefined;

      if (photos.length > 0) {
        const fd = new FormData();
        fd.set("name", form.name);
        if (form.email) fd.set("email", form.email);
        if (form.phone) fd.set("phone", form.phone);
        fd.set("company", form.company);
        fd.set("rating", String(rating));
        fd.set("comment", form.comment);
        photos.forEach((file) => fd.append("photos", file));

        const { data } = await api.post(
          `/api/projects/${id}/recommendations`,
          fd,
        );
        recommendationId = data?.recommendationId;
      } else {
        const { data } = await api.post(`/api/projects/${id}/recommendations`, {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          company: form.company,
          rating,
          comment: form.comment,
        });
        recommendationId = data?.recommendationId;
      }

      if (!recommendationId) {
        throw new Error("Could not save recommendation");
      }

      trackAnonymousRecommendation(recommendationId);

      setNotice("Thanks! Your recommendation has been submitted.");
      setTimeout(() => successRef.current?.focus(), 0);

      if (form.hireAgain === "yes") {
        try {
          await api.post(`/api/recommendations/${recommendationId}/like`);
        } catch {}
      }

      setTimeout(() => {
        if (!user) {
          router.replace("/");
        } else {
          router.replace(`/projects/${id}`);
        }
      }, 500);
    } catch (e: any) {
      setFormError(
        e?.response?.data?.error ||
          e?.message ||
          "Failed to submit recommendation",
      );
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Recommend a tradesperson — VetMyBuilder</title>
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-stone-50">
        {/* Background bands */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-10">

          {/* Page header card */}
          <div className="mb-6 bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-8 py-6">
            <h1 className="text-3xl font-black tracking-tight text-zinc-900">
              {loading
                ? "Recommend a tradesperson"
                : `Recommend for "${project?.name ?? ""}"`}
            </h1>
            {!loading && project && (
              <p className="mt-1 text-sm text-zinc-500">
                Project location: {project.location}
              </p>
            )}
          </div>

          {pageError && (
            <div className="mb-4">
              <Banner kind="error" focusRef={errorRef}>
                {pageError}
              </Banner>
            </div>
          )}

          {!loading && project && (
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-8 py-8">
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
                    You can submit without an account — or{" "}
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

              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label htmlFor="recommend-name" className={labelClass}>
                    Your name
                  </label>
                  <input
                    id="recommend-name"
                    data-testid="recommend-name"
                    className={`${inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    disabled={lockIdentity}
                  />
                </div>

                <div>
                  <label htmlFor="recommend-email" className={labelClass}>
                    Your email <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="recommend-email"
                    data-testid="recommend-email"
                    className={`${inputClass} ${lockIdentity ? "opacity-60 cursor-not-allowed" : ""}`}
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    disabled={lockIdentity}
                  />
                </div>

                <div>
                  <label htmlFor="recommend-company" className={labelClass}>
                    Company name
                  </label>
                  <input
                    id="recommend-company"
                    data-testid="recommend-company"
                    className={inputClass}
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="recommend-phone" className={labelClass}>
                    Company phone number <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <input
                    id="recommend-phone"
                    data-testid="recommend-phone"
                    className={inputClass}
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    inputMode="tel"
                  />
                </div>

                <div>
                  <label
                    htmlFor="recommend-hire-again"
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      id="recommend-hire-again"
                      data-testid="recommend-hire-again"
                      type="checkbox"
                      checked={form.hireAgain === "yes"}
                      onChange={(e) =>
                        set("hireAgain", e.target.checked ? "yes" : "no")
                      }
                      className="h-5 w-5 accent-red-500"
                    />
                    <span className="text-sm font-bold text-zinc-900">
                      Yes, I would hire them again
                    </span>
                  </label>
                </div>

                <div>
                  <label className={labelClass}>
                    Photos <span className="font-normal text-zinc-400">(optional)</span>
                  </label>
                  <FileGridUploader
                    files={photos}
                    onChange={setPhotos}
                    maxFiles={8}
                    maxSizeMB={10}
                  />
                </div>

                <div>
                  <label htmlFor="recommend-comment" className={labelClass}>
                    Comment <span className="font-normal text-zinc-400">(min 10 characters)</span>
                  </label>
                  <textarea
                    id="recommend-comment"
                    data-testid="recommend-comment"
                    className={`${inputClass} min-h-32 resize-none`}
                    value={form.comment}
                    onChange={(e) => set("comment", e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {submitting ? "Sending…" : "Submit recommendation"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
