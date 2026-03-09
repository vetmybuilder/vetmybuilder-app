// web/pages/projects/[id]/recommend.tsx
import AuthedOnly from "@/components/AuthedOnly";
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
        ? "bg-rose-50 border-rose-200 text-rose-800"
        : "bg-slate-50 border-slate-200 text-slate-800";

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className={`rounded-xl border px-4 py-3 ${styles} outline-none`}
    >
      {children}
    </div>
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

      setNotice("Thanks! Your recommendation has been submitted.");
      setTimeout(() => successRef.current?.focus(), 0);

      if (form.hireAgain === "yes") {
        try {
          await api.post(`/api/recommendations/${recommendationId}/like`);
        } catch {}
      }

      // allow banner to be visible before navigating
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
    <AuthedOnly>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            {loading ? "Recommend" : `Recommend for “${project?.name ?? ""}”`}
          </h1>
          {!loading && project && (
            <p className="mt-1 text-sm text-slate-500">
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
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
            {formError && (
              <div className="mb-4">
                <Banner kind="error" focusRef={errorRef}>
                  {formError}
                </Banner>
              </div>
            )}

            {notice && (
              <div className="mb-4">
                <Banner kind="success" focusRef={successRef}>
                  {notice}
                </Banner>
              </div>
            )}

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label htmlFor="recommend-name" className="mb-1 block text-sm">
                  Your name
                </label>
                <input
                  id="recommend-name"
                  data-testid="recommend-name"
                  className={`input w-full ${
                    lockIdentity ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  disabled={lockIdentity}
                />
              </div>

              <div>
                <label htmlFor="recommend-email" className="mb-1 block text-sm">
                  Your email (optional)
                </label>
                <input
                  id="recommend-email"
                  data-testid="recommend-email"
                  className={`input w-full ${
                    lockIdentity ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={lockIdentity}
                />
              </div>

              <div>
                <label
                  htmlFor="recommend-company"
                  className="mb-1 block text-sm"
                >
                  Company name
                </label>
                <input
                  id="recommend-company"
                  data-testid="recommend-company"
                  className="input w-full"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="recommend-phone" className="mb-1 block text-sm">
                  Company phone number (optional)
                </label>
                <input
                  id="recommend-phone"
                  data-testid="recommend-phone"
                  className="input w-full"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  inputMode="tel"
                />
              </div>

              <div>
                <label
                  htmlFor="recommend-hire-again"
                  className="mt-1 flex items-center gap-2"
                >
                  <input
                    id="recommend-hire-again"
                    data-testid="recommend-hire-again"
                    type="checkbox"
                    checked={form.hireAgain === "yes"}
                    onChange={(e) =>
                      set("hireAgain", e.target.checked ? "yes" : "no")
                    }
                    className="h-5 w-5 accent-indigo-500"
                  />
                  <span className="text-sm text-slate-700">
                    Yes, I would hire them again
                  </span>
                </label>
              </div>

              <div>
                <label className="mb-1 block text-sm">Photos (optional)</label>
                <FileGridUploader
                  files={photos}
                  onChange={setPhotos}
                  maxFiles={8}
                  maxSizeMB={10}
                />
              </div>

              <div>
                <label
                  htmlFor="recommend-comment"
                  className="mb-1 block text-sm"
                >
                  Comment (min 10 characters)
                </label>
                <textarea
                  id="recommend-comment"
                  data-testid="recommend-comment"
                  className="input min-h-32 w-full"
                  value={form.comment}
                  onChange={(e) => set("comment", e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn w-full disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Submit recommendation"}
              </button>
            </form>
          </div>
        )}
      </div>
    </AuthedOnly>
  );
}
