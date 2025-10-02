import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type Project = { id: number; name: string; location: string; status: string };

export default function RecommendOnPlatform() {
  const api = useApi();
  const router = useRouter();
  const { id } = router.query;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    rating: 5,
    comment: "",
  });
  const [submitting, setSubmitting] = useState(false);

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

  // Prefill BOTH name + email for logged-in users; inputs remain read-only
  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) Prefer server profile (/api/me)
      try {
        const me = await api.get("/api/me");
        const serverName = me?.data?.name ?? me?.data?.user?.name ?? "";
        const serverEmail = me?.data?.email ?? me?.data?.user?.email ?? "";
        const serverPhone = me?.data?.phone ?? me?.data?.user?.phone ?? "";
        if (alive) {
          setForm((prev) => ({
            ...prev,
            name: prev.name || serverName || nameFromEmail(serverEmail),
            email: prev.email || serverEmail,
            phone: prev.phone || serverPhone || "",
          }));
        }
      } catch {
        // ignore; fall through to Firebase
      }

      // 2) Fallback to Firebase currentUser
      try {
        const { getAuth } = await import("firebase/auth");
        const u = getAuth().currentUser;
        if (u && alive) {
          const displayName = u.displayName || "";
          const email = u.email || "";
          setForm((prev) => ({
            ...prev,
            name: prev.name || displayName || nameFromEmail(email),
            email: prev.email || email,
            // phone is usually not on Firebase user; leave as-is
          }));
        }
      } catch {
        // no firebase in this env — fine
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]);

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
        rating: Number(form.rating),
        comment: form.comment,
      });
      alert("Thanks! Your recommendation has been submitted.");
      router.replace(`/projects/${id}`);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to submit recommendation");
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
                  className="input"
                  placeholder="Your name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  readOnly
                  aria-readonly="true"
                />
                <input
                  className="input"
                  placeholder="Your email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                  readOnly
                  aria-readonly="true"
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
                <label className="text-sm">Rating (1–5)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={5}
                  value={form.rating}
                  onChange={(e) => set("rating", e.target.value)}
                  required
                />
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
