import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/utils/auth";

type Resolved = { token: string; project: { id: number; name: string } };

const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

async function fetchJSON(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  const ct = res.headers.get("content-type") || "";
  const isJSON = ct.includes("application/json");
  if (!res.ok) {
    const msg = isJSON
      ? (await res.json()).error || res.statusText
      : res.statusText;
    throw new Error(msg);
  }
  return isJSON ? res.json() : null;
}

function deriveNameFromUser(u: {
  displayName?: string | null;
  email?: string | null;
}) {
  if (u.displayName && u.displayName.trim()) return u.displayName.trim();
  const email = (u.email || "").trim();
  if (!email) return "";
  const local = email.split("@")[0] || "";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MagicRecommendation() {
  const router = useRouter();
  const { token } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    hireAgain: "yes" as "yes" | "no", // replaces rating
    comment: "",
  });
  const [lockIdentity, setLockIdentity] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // only prefill once so we don’t overwrite user edits
  const prefilledRef = useRef(false);

  // Resolve token → project
  useEffect(() => {
    if (!router.isReady || !token) return;
    let alive = true;
    (async () => {
      try {
        const data = await fetchJSON(
          `${API}/api/recommendations/magic/${token}`
        );
        if (!alive) return;
        setResolved(data);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Invalid or expired link");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router.isReady, token]);

  // Prefill + lock when signed in (after auth has resolved)
  useEffect(() => {
    if (authLoading) return;
    if (user && !prefilledRef.current) {
      const guessName = deriveNameFromUser(user);
      setForm((prev) => ({
        ...prev,
        name: prev.name || guessName,
        email: prev.email || user.email || "",
      }));
      setLockIdentity(true);
      prefilledRef.current = true;
    } else if (!user) {
      setLockIdentity(false);
    }
  }, [authLoading, user]);

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      let payloadName = form.name;
      let payloadEmail: string | undefined = form.email || undefined;

      if (user) {
        const idt = await user.getIdToken();
        headers.Authorization = `Bearer ${idt}`;
        // prefer account identity when logged in
        payloadName = deriveNameFromUser(user) || form.name;
        payloadEmail = user.email || form.email || undefined;
      }

      // Map hireAgain to rating for current backend schema (5=yes, 1=no)
      const ratingFromHire = form.hireAgain === "yes" ? 5 : 1;

      await fetchJSON(`${API}/api/recommendations/magic/${token}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: payloadName,
          email: payloadEmail,
          phone: form.phone || undefined,
          company: form.company,
          rating: ratingFromHire,
          comment: form.comment,
        }),
      });
      setSent(true);
    } catch (e: any) {
      const msg = e?.message || "Failed to submit recommendation";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const commentTooShort = form.comment.trim().length < 10;

  return (
    <Layout>
      <div className="max-w-xl mx-auto card">
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <div>
            <h1 className="text-xl font-semibold mb-2">Oops</h1>
            <p className="text-red-400">{error}</p>
          </div>
        ) : sent ? (
          <div>
            <h1 className="text-xl font-semibold mb-2">Thanks!</h1>
            <p>Your recommendation has been submitted.</p>
          </div>
        ) : (
          resolved && (
            <>
              <h1 className="text-xl font-semibold mb-2">
                Recommend for “{resolved.project.name}”
              </h1>
              <p className="text-sm text-zinc-400 mb-4">
                {user
                  ? `Signed in as ${
                      user.email ?? "your account"
                    } — your name and email are locked for accuracy.`
                  : "Submitting via a shared invite link."}
              </p>

              <form onSubmit={submit} className="grid grid-cols-1 gap-3">
                <input
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
                <input
                  className={`input ${
                    lockIdentity ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  placeholder="Your email (optional)"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  disabled={lockIdentity}
                  readOnly={lockIdentity}
                />

                <input
                  className="input"
                  placeholder="Company / Tradesperson"
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  required
                />
                <input
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
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="hireAgain"
                        className="accent-indigo-500"
                        value="yes"
                        checked={form.hireAgain === "yes"}
                        onChange={() => set("hireAgain", "yes")}
                      />
                      Yes
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
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
                  <p className="text-xs text-zinc-400 mt-1">
                    “Yes” counts as a like in the UI. “No” does not add a
                    negative score.
                  </p>
                </fieldset>

                <label className="text-sm">Comment (min 10 characters)</label>
                <textarea
                  className="input min-h-32"
                  placeholder="Comment"
                  value={form.comment}
                  onChange={(e) => set("comment", e.target.value)}
                  required
                />
                {commentTooShort && (
                  <p className="text-xs text-red-400">
                    Please write at least 10 characters.
                  </p>
                )}

                <button
                  className="btn disabled:opacity-50"
                  disabled={submitting || commentTooShort}
                >
                  {submitting ? "Sending…" : "Send recommendation"}
                </button>
              </form>
            </>
          )
        )}
      </div>
    </Layout>
  );
}
