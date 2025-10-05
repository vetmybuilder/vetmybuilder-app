// web/pages/register.tsx
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

export default function Register() {
  const api = useApi();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const { firstName, lastName, username, email, password } = form;

      // 1) Create Firebase user
      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // 2) Optional — set display name in Firebase
      try {
        await updateProfile(cred.user, {
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch {
        // Not fatal if this fails in some environments
      }

      // 3) Save names/username in your DB
      await api.post("/api/account", { firstName, lastName, username });

      // 4) Go to projects
      router.replace("/projects");
    } catch (e: any) {
      setErr(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create account</title>
      </Head>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold mb-4">Create account</h1>

        <form className="grid gap-3" onSubmit={onSubmit} noValidate>
          <label className="text-sm" htmlFor="reg-fn">
            First name
          </label>
          <input
            id="reg-fn"
            className="input"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            placeholder="First name"
            autoComplete="given-name"
          />

          <label className="text-sm" htmlFor="reg-ln">
            Last name
          </label>
          <input
            id="reg-ln"
            className="input"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            required
            placeholder="Last name"
            autoComplete="family-name"
          />

          <label className="text-sm" htmlFor="reg-un">
            Username
          </label>
          <input
            id="reg-un"
            className="input"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />

          <label className="text-sm" htmlFor="reg-email">
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
          />

          <label className="text-sm" htmlFor="reg-pass">
            Password
          </label>
          <input
            id="reg-pass"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
            placeholder="••••••••"
            autoComplete="new-password"
          />

          {err && <p className="text-red-600">{err}</p>}

          <button className="btn" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>

          <p className="text-sm text-slate-600">
            Already have an account?{" "}
            <Link className="link" href="/login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
