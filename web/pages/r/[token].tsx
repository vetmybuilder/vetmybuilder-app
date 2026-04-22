import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";

type MLInfo = {
  token: string;
  project: { id: number; name: string };
};

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_BASE || "";
}

/** Try to obtain a Firebase ID token from a variety of user shapes. */
async function resolveIdToken(user: any): Promise<string | undefined> {
  try {
    if (!user) return undefined;
    if (typeof user.getIdToken === "function") {
      return await user.getIdToken();
    }
    const maybe = user?.stsTokenManager?.accessToken;
    if (typeof maybe === "string" && maybe) return maybe;
  } catch {
    // ignore
  }
  return undefined;
}

export default function RecommendViaMagicLink() {
  const api = useApi();
  const { user } = useAuth();
  const router = useRouter();
  const { token } = router.query;

  const [info, setInfo] = useState<MLInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    hireAgain: "yes" as "yes" | "no",
    comment: "",
  });
  const [lockIdentity, setLockIdentity] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  // Photo consent (Acceptable Use Policy) - submit blocked when photos
  // are attached but consent not granted.
  const [photoConsent, setPhotoConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onPickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 8);
    setPhotos(files);
  };

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const commentTooShort = form.comment.trim().length < 10;
  const nameRequired = !lockIdentity; // if identity is locked, name is provided by account
  const photoConsentMissing = photos.length > 0 && !photoConsent;
  const formInvalid =
    (nameRequired && !form.name.trim()) ||
    !form.company.trim() ||
    commentTooShort ||
    photoConsentMissing;

  // Prefill from account when logged in; lock identity
  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const { data } = await api.get("/api/account");
        // server returns { user, profile }
        const acc = data?.user || {};
        const fullName = `${acc.firstName || ""} ${acc.lastName || ""}`.trim();
        setForm((prev) => ({
          ...prev,
          name: prev.name || fullName || user.displayName || "",
          email: prev.email || acc.email || user.email || "",
        }));
        setLockIdentity(true);
      } catch {
        setForm((prev) => ({
          ...prev,
          name: prev.name || user.displayName || "",
          email: prev.email || user.email || "",
        }));
        setLockIdentity(true);
      }
    })();
  }, [user, api]);

  // Resolve the magic link
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/recommendations/magic/${token}`);
        setInfo(data);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Invalid or expired link");
      } finally {
        setLoading(false);
      }
    })();
  }, [api, token]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!info || submitting) return;

    const formEl = e.currentTarget;
    if (!formEl.checkValidity()) {
      formEl.reportValidity();
      return;
    }
    if (formInvalid) {
      formEl.reportValidity();
      return;
    }

    setSubmitting(true);
    setErr(null);

    const disableRedirect =
      router.query.noRedirect === "1" ||
      process.env.NEXT_PUBLIC_DISABLE_MAGIC_REDIRECT === "1";

    try {
      const rating = form.hireAgain === "yes" ? 5 : 1;
      // 👇 match the GET path
      const endpoint = `/api/recommendations/magic/${info.token}`;

      const idToken = await resolveIdToken(user);
      const authHeaders: HeadersInit | undefined = idToken
        ? { Authorization: `Bearer ${idToken}` }
        : undefined;

      let recommendationId: number | undefined;

      if (photos.length > 0) {
        const fd = new FormData();
        fd.set("name", form.name);
        if (form.email) fd.set("email", form.email);
        if (form.phone) fd.set("phone", form.phone);
        fd.set("company", form.company);
        fd.set("hireAgain", form.hireAgain);
        fd.set("rating", String(rating));
        fd.set("comment", form.comment);
        photos.forEach((f) => fd.append("photos", f));

        const res = await fetch(endpoint, {
          method: "POST",
          headers: authHeaders,
          body: fd,
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = "Failed to submit";
          try {
            msg = JSON.parse(text)?.error || msg;
          } catch {}
          throw new Error(msg);
        }
        try {
          recommendationId = JSON.parse(text)?.recommendationId;
        } catch {}
      } else {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeaders || {}),
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email || undefined,
            phone: form.phone || undefined,
            company: form.company,
            hireAgain: form.hireAgain,
            rating,
            comment: form.comment,
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = "Failed to submit";
          try {
            msg = JSON.parse(text)?.error || msg;
          } catch {}
          throw new Error(msg);
        }
        try {
          recommendationId = JSON.parse(text)?.recommendationId;
        } catch {}
      }

      // Auto-like (idempotent)
      if (form.hireAgain === "yes" && recommendationId && idToken) {
        try {
          const likeEndpoint = `/api/recommendations/${recommendationId}/like`;
          await fetch(likeEndpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
          });
        } catch {
          /* non-blocking */
        }
      }

      setSubmitted(true);

      if (!disableRedirect) {
        setTimeout(() => router.replace("/"), 3000);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to submit recommendation");
    } finally {
      setSubmitting(false);
    }
  };

  const ids = useMemo(
    () => ({
      name: "ml-name",
      email: "ml-email",
      company: "ml-company",
      phone: "ml-phone",
      yes: "ml-hire-yes",
      no: "ml-hire-no",
      photos: "ml-photos",
      comment: "ml-comment",
      commentHelp: "ml-comment-help",
    }),
    []
  );

  return (
    <>
      <Head>
        <title>Recommend</title>
      </Head>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {loading
              ? "Recommend"
              : `Recommend for “${info?.project?.name ?? ""}”`}
          </h1>
        </div>

        <div
          className="card"
          data-testid="recommendation-submitted-confirmation"
        >
          {loading ? (
            <p data-testid="magic-loading">Loading…</p>
          ) : err ? (
            <p className="text-red-600" data-testid="magic-error">
              {err}
            </p>
          ) : !info ? (
            <p data-testid="magic-not-found">Not found</p>
          ) : submitted ? (
            <div className="text-center py-8" data-testid="magic-submitted">
              <h2 className="text-xl font-semibold mb-2">Thanks!</h2>
              <p data-testid="magic-submitted-message">
                Your recommendation has been sent.
              </p>

              {!(
                router.query.noRedirect === "1" ||
                process.env.NEXT_PUBLIC_DISABLE_MAGIC_REDIRECT === "1"
              ) ? (
                <p className="text-slate-500 mt-1" data-testid="magic-redirect">
                  Redirecting to the homepage…
                </p>
              ) : (
                <p className="text-slate-500 mt-1" data-testid="magic-stay">
                  You can close this tab or go back to the project.
                </p>
              )}
            </div>
          ) : (
            <form
              onSubmit={submit}
              noValidate
              className="grid grid-cols-1 gap-3"
              data-testid="magic-form"
            >
              <label htmlFor={ids.name} className="text-sm">
                Your name
              </label>
              <input
                id={ids.name}
                className="input"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                readOnly={lockIdentity}
                disabled={lockIdentity}
              />

              <label htmlFor={ids.email} className="text-sm">
                Your email (optional)
              </label>
              <input
                id={ids.email}
                className="input"
                placeholder="Your email (optional)"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                readOnly={lockIdentity}
                disabled={lockIdentity}
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
                pattern="^[0-9 +()\\-]*$"
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
                  “Yes” counts as a like in the UI. “No” does not add a negative
                  score.
                </p>
              </fieldset>

              <label htmlFor={ids.photos} className="text-sm">
                Photos (up to 8, max 8MB each)
              </label>
              <input
                id={ids.photos}
                name="photos"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                className="input"
                onChange={onPickPhotos}
              />

              {photos.length > 0 && (
                <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-red-500 focus:ring-red-400"
                  />
                  <span className="leading-snug">
                    I confirm I have the right to share these photos. Anyone
                    clearly visible has agreed, and the photos do not contain
                    children or reveal someone else&apos;s home address. (
                    <a
                      href="/acceptable-use"
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-red-600"
                    >
                      Acceptable Use Policy
                    </a>
                    )
                  </span>
                </label>
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
                className={`btn inline-flex items-center gap-2 disabled:opacity-50 ${submitting ? "!bg-zinc-400" : "active:scale-95"}`}
                disabled={submitting || formInvalid}
              >
                {submitting && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
                {submitting ? "Sending…" : "Send recommendation"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
