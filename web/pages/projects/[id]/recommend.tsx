import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { useAuth } from "@/utils/auth";

type Project = { id: number; name: string; location: string; status: string };

function StatusBanner({
  kind,
  children,
  focusRef,
}: {
  kind: "success" | "error" | "info";
  children: ReactNode;
  focusRef?: RefObject<HTMLDivElement | null>;
}) {
  const styles =
    kind === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : kind === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-blue-50 border-blue-200 text-blue-800";
  const role = kind === "error" ? "alert" : "status";
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={role}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={`mb-4 rounded-xl border px-4 py-3 ${styles} outline-none`}
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
  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    setPhotos(files);
  };

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    hireAgain: "yes" as "yes" | "no",
    comment: "",
  });
  const [lockIdentity, setLockIdentity] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Inline banners
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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
        setPageError(e?.response?.data?.error || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [api, id]);

  // Prefill identity: prefer server firstName/lastName (no email-derived names).
  useEffect(() => {
    if (authLoading) return;

    if (user && !prefilledRef.current) {
      (async () => {
        try {
          const me = await api.get("/api/me");
          const serverEmail: string =
            me?.data?.email ?? me?.data?.user?.email ?? "";

          const firstName: string =
            me?.data?.firstName ?? me?.data?.user?.firstName ?? "";
          const lastName: string =
            me?.data?.lastName ?? me?.data?.user?.lastName ?? "";
          const fullName = [firstName, lastName]
            .filter(Boolean)
            .join(" ")
            .trim();

          setForm((prev) => ({
            ...prev,
            name: prev.name || fullName || "",
            email: prev.email || serverEmail || "",
          }));

          // Lock when we know either a real name OR an email
          setLockIdentity(Boolean(fullName || serverEmail));
          prefilledRef.current = true;
          return;
        } catch {
          // Fall back to Firebase client only for displayName/email
        }

        try {
          const { getAuth } = await import("firebase/auth");
          const u = getAuth().currentUser;
          const displayName = (u?.displayName || "").trim();
          const email = u?.email || "";

          setForm((prev) => ({
            ...prev,
            name: prev.name || displayName || "",
            email: prev.email || email || "",
          }));

          setLockIdentity(Boolean(displayName || email));
          prefilledRef.current = true;
        } catch {
          setLockIdentity(false);
        }
      })();
    } else if (!user) {
      setLockIdentity(false);
    }
  }, [authLoading, user, api]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || submitting) return;
    setFormError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const ratingFromHire = form.hireAgain === "yes" ? 5 : 1;
      let recommendationId: number | undefined;

      if (photos.length > 0) {
        const fd = new FormData();
        fd.set("name", form.name);
        if (form.email) fd.set("email", form.email);
        if (form.phone) fd.set("phone", form.phone);
        fd.set("company", form.company);
        fd.set("rating", String(ratingFromHire));
        fd.set("comment", form.comment);
        photos.forEach((f) => fd.append("photos", f));

        const { data } = await api.post(
          `/api/projects/${id}/recommendations`,
          fd
        );
        recommendationId = data?.recommendationId;
      } else {
        const { data } = await api.post(`/api/projects/${id}/recommendations`, {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          company: form.company,
          rating: ratingFromHire,
          comment: form.comment,
        });
        recommendationId = data?.recommendationId;
      }

      // Verify we received a valid id
      if (!recommendationId) {
        throw new Error("Recommendation was not saved. Please try again.");
      }

      // Inline success + focus for SR users
      setNotice("Thanks! Your recommendation has been submitted.");
      setTimeout(() => successRef.current?.focus(), 10000);

      // Optional like: non-blocking
      if (form.hireAgain === "yes") {
        try {
          await api.post(`/api/recommendations/${recommendationId}/like`);
        } catch {
          // ignore like errors
        }
      }

      // Small delay so the user can read the message, then go back
      setTimeout(() => {
        router.replace(`/projects/${id}`);
      }, 1000);
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to submit recommendation";
      setFormError(msg);
      setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  const ids = useMemo(
    () => ({
      name: "plat-name",
      email: "plat-email",
      company: "plat-company",
      phone: "plat-phone",
      yes: "plat-yes",
      no: "plat-no",
      photos: "plat-photos",
      comment: "plat-comment",
      commentHelp: "plat-comment-help",
    }),
    []
  );

  const commentTooShort = form.comment.trim().length < 10;

  return (
    <AuthedOnly>
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur px-6 py-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {loading
                  ? "Recommend"
                  : `Recommend for “${project?.name ?? ""}”`}
              </h1>
              {!loading && project && (
                <p className="mt-1 text-sm text-slate-500">
                  Project location: {project.location}
                </p>
              )}
            </div>
            <Link
              href={`/projects/${id}`}
              aria-label="Back to project details"
              title="Back to project details"
              className="btn-back"
            >
              <svg
                viewBox="0 0 24 24"
                className="icon-24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 19l-7-7 7-7" />
                <path d="M3 12h18" />
              </svg>
              <span className="sr-only">Back to project details</span>
            </Link>
          </div>
        </div>

        <div className="card" data-testid="recommendation-card">
          {pageError && (
            <StatusBanner kind="error" focusRef={errorRef}>
              {pageError}
            </StatusBanner>
          )}

          {loading ? (
            <p>Loading…</p>
          ) : !project ? (
            <p>Not found</p>
          ) : (
            <>
              {formError && (
                <StatusBanner kind="error" focusRef={errorRef}>
                  {formError}
                </StatusBanner>
              )}
              {notice && (
                <StatusBanner kind="success" focusRef={successRef}>
                  {notice}
                </StatusBanner>
              )}

              <form onSubmit={submit} className="grid grid-cols-1 gap-3">
                <label htmlFor={ids.name} className="text-sm">
                  Your name
                </label>
                <input
                  id={ids.name}
                  className={`input ${
                    lockIdentity ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  disabled={lockIdentity}
                  readOnly={lockIdentity}
                />

                <label htmlFor={ids.email} className="text-sm">
                  Your email
                </label>
                <input
                  id={ids.email}
                  className={`input ${
                    lockIdentity ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  placeholder="Your email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                  disabled={lockIdentity}
                  readOnly={lockIdentity}
                />

                <label htmlFor={ids.company} className="text-sm">
                  Company / Tradesperson
                </label>
                <input
                  id={ids.company}
                  className="input"
                  placeholder="Company / Tradesperson"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  required
                />

                <label htmlFor={ids.phone} className="text-sm">
                  Company / Tradesperson phone (optional)
                </label>
                <input
                  id={ids.phone}
                  className="input"
                  placeholder="Company / Tradesperson phone (optional)"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  inputMode="tel"
                  pattern="[\d +()-]*"
                />

                <fieldset className="mt-1">
                  <legend className="text-sm mb-1">Hire again?</legend>
                  <div className="flex gap-4">
                    <label
                      htmlFor={ids.yes}
                      className="inline-flex items-center gap-2"
                    >
                      <input
                        id={ids.yes}
                        type="radio"
                        name="hireAgain"
                        className="accent-indigo-500"
                        value="yes"
                        checked={form.hireAgain === "yes"}
                        onChange={() => set("hireAgain", "yes")}
                      />
                      Yes
                    </label>
                    <label
                      htmlFor={ids.no}
                      className="inline-flex items-center gap-2"
                    >
                      <input
                        id={ids.no}
                        type="radio"
                        name="hireAgain"
                        className="accent-indigo-500"
                        value="no"
                        checked={form.hireAgain === "no"}
                        onChange={() => set("hireAgain", "no")}
                      />
                      No
                    </label>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    “Yes” counts as a like. “No” does not add a negative score.
                  </p>
                </fieldset>

                <label htmlFor={ids.photos} className="text-sm">
                  Photos (up to 8, max 8MB each)
                </label>
                <input
                  id={ids.photos}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="input"
                  onChange={onPickPhotos}
                />
                {photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {photos.map((f, i) => (
                      <div
                        key={i}
                        className="aspect-square overflow-hidden rounded border border-gray-200"
                        title={f.name}
                      >
                        <img
                          src={URL.createObjectURL(f)}
                          className="h-full w-full object-cover"
                          alt={f.name}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <label htmlFor={ids.comment} className="text-sm">
                  Comment (min 10 characters)
                </label>
                <textarea
                  id={ids.comment}
                  aria-describedby={ids.commentHelp}
                  className="input min-h-32"
                  placeholder="Comment"
                  value={form.comment}
                  onChange={(e) => set("comment", e.target.value)}
                  required
                />
                <p id={ids.commentHelp} className="text-xs text-red-600">
                  {commentTooShort
                    ? "Please write at least 10 characters."
                    : "\u00A0"}
                </p>

                <button
                  className="btn disabled:opacity-50"
                  disabled={submitting || commentTooShort}
                >
                  {submitting ? "Sending…" : "Send recommendation"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AuthedOnly>
  );
}
