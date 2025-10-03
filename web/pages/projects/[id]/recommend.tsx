import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/utils/auth";

type Project = { id: number; name: string; location: string; status: string };

export default function RecommendOnPlatform() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    // hireAgain replaces rating
    hireAgain: "yes" as "yes" | "no",
    comment: "",
  });
  const [lockIdentity, setLockIdentity] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // avoid re-prefilling after user edits
  const prefilledRef = useRef(false);

  // Utility: derive a display-ish name from email local-part
  const nameFromEmail = (email?: string | null) => {
    if (!email) return "";
    const local = email.split("@")[0] || "";
    return local
      .replace(/[._-]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  };

  // Load project header
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        setProject(data.project);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [api, id]);

  // Prefill & lock identity ONLY when logged in.
  // We wait until authLoading is false so we don't lock empty fields on reload.
  useEffect(() => {
    if (authLoading) return;

    if (user && !prefilledRef.current) {
      (async () => {
        // try server profile first (requires token; api helper should attach it)
        try {
          const me = await api.get("/api/me");
          const serverEmail = me?.data?.email ?? me?.data?.user?.email ?? "";
          const serverName =
            me?.data?.name ??
            me?.data?.user?.name ??
            nameFromEmail(serverEmail);

          setForm((prev) => ({
            ...prev,
            name: prev.name || serverName || "",
            email: prev.email || serverEmail || "",
          }));
          setLockIdentity(true);
          prefilledRef.current = true;
          return;
        } catch {
          // ignore 401/other; fall back to firebase user
        }

        try {
          const { getAuth } = await import("firebase/auth");
          const u = getAuth().currentUser;
          const email = u?.email || "";
          const displayName =
            u?.displayName || nameFromEmail(email) || form.name;
          setForm((prev) => ({
            ...prev,
            name: prev.name || displayName || "",
            email: prev.email || email || "",
          }));
          setLockIdentity(true);
          prefilledRef.current = true;
        } catch {
          // no firebase available; leave unlocked
          setLockIdentity(false);
        }
      })();
    } else if (!user) {
      // not signed in → allow editing
      setLockIdentity(false);
    }
  }, [authLoading, user, api]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: any) => setForm((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/api/projects/${id}/recommendations`, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company,
        hireAgain: form.hireAgain, // <-- server maps to rating
        comment: form.comment,
      });
      alert("Thanks! Your recommendation has been submitted.");
      router.replace(`/projects/${id}`);
    } catch (e: any) {
      const msg = e?.response?.data?.error || "Failed to submit recommendation";
      const issues = e?.response?.data?.issues;
      alert(msg + (issues ? "\n" + JSON.stringify(issues, null, 2) : ""));
    } finally {
      setSubmitting(false);
    }
  };

  const commentTooShort = form.comment.trim().length < 10;

  return (
    <Layout>
      <AuthedOnly>
        <div className="max-w-xl mx-auto card">
          {loading ? (
            <p>Loading…</p>
          ) : err ? (
            <p className="text-red-400">{err}</p>
          ) : !project ? (
            <p>Not found</p>
          ) : (
            <>
              <h1 className="text-xl font-semibold mb-2">
                Recommend for “{project.name}”
              </h1>
              <p className="text-sm text-zinc-400 mb-4">
                Project location: {project.location}
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
                  placeholder="Your email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
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
                    “Yes” counts as a like. “No” does not add a negative score.
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
          )}
        </div>
      </AuthedOnly>
    </Layout>
  );
}
