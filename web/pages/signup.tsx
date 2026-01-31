// web/pages/signup.tsx
import Head from "next/head";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/utils/auth";
import { ensureEmailAvailable } from "@/utils/email";

export default function Signup() {
  const api = useApi();
  const router = useRouter();
  const { hydrateFromSignup } = useAuth();

  const explicitNext = useMemo(() => {
    if (!router.isReady) return null;
    const n = router.query.next;
    const v = typeof n === "string" ? n : Array.isArray(n) ? n[0] : "";
    return v && v.startsWith("/") ? v : null;
  }, [router.isReady, router.query.next]);

  const nextPath = explicitNext || "/projects";

  useEffect(() => {
    try {
      if (nextPath) sessionStorage.setItem("vmb:returnTo", nextPath);
    } catch {}
  }, [nextPath]);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    location: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function postSignupWithBearer(input: {
    firstName: string;
    lastName: string;
    username: string;
    location: string;
    idToken: string;
  }) {
    const payload = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username: input.username.trim() || undefined,
      location: input.location.trim() || undefined,
    };

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.idToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      let msg = `Failed to save signup profile: ${res.status}`;
      try {
        const j: any = await res.json();
        msg = j?.message || j?.error || msg;
      } catch {}
      throw new Error(msg);
    }

    return payload;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const firstName = form.firstName;
      const lastName = form.lastName;
      const username = form.username;
      const email = form.email.trim();
      const password = form.password;
      const location = form.location;

      await ensureEmailAvailable(api, email);

      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      try {
        await updateProfile(cred.user, {
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch {}

      const idToken = await cred.user.getIdToken(true);

      const saved = await postSignupWithBearer({
        firstName,
        lastName,
        username,
        location,
        idToken,
      });

      hydrateFromSignup({
        firstName: saved.firstName,
        lastName: saved.lastName,
        username: saved.username ?? null,
        email,
      });

      const target = nextPath || "/projects";

      try {
        sessionStorage.setItem("vmb:returnTo", target);
        sessionStorage.setItem("vmb:didLoginRedirect", String(Date.now()));
      } catch {}

      router.replace(target);
    } catch (e: any) {
      const raw = e?.message || "";

      if (
        raw.includes("already exists (including aliases)") ||
        raw.includes("already exists. Try signing in")
      ) {
        setErr(
          "An account with this email already exists. Try signing in instead.",
        );
      } else if (raw.startsWith("Firebase:")) {
        if (raw.includes("auth/email-already-in-use")) {
          setErr(
            "An account with this email already exists. Try signing in instead.",
          );
        } else if (raw.includes("auth/weak-password")) {
          setErr("Your password is too weak. Try a longer password.");
        } else {
          setErr("Registration failed. Please double-check your details.");
        }
      } else {
        setErr(raw || "Registration failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Create account</title>
      </Head>

      <div className="mx-auto max-w-md" data-testid="register-page">
        <h1
          className="mb-4 text-2xl font-semibold"
          id="register-title"
          data-testid="register-title"
        >
          Create account
        </h1>

        <form
          className="grid gap-3"
          onSubmit={onSubmit}
          noValidate
          aria-label="Create account form"
          aria-describedby="register-help"
          aria-busy={loading ? "true" : "false"}
          data-testid="register-form"
        >
          <p id="register-help" className="sr-only">
            All fields marked as required must be completed to create your
            account.
          </p>

          <label className="text-sm" htmlFor="reg-fn">
            First name
          </label>
          <input
            id="reg-fn"
            className="input"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
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
          />

          <label className="text-sm" htmlFor="reg-un">
            Username
          </label>
          <input
            id="reg-un"
            className="input"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
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
          />

          <label className="text-sm" htmlFor="reg-loc">
            Postcode or City/Borough
          </label>
          <input
            id="reg-loc"
            className="input"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            required
          />

          {err && (
            <p className="text-red-600" role="alert">
              {err}
            </p>
          )}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>

          <p className="text-sm text-slate-600">
            Already have an account?{" "}
            <Link href={{ pathname: "/login", query: { next: nextPath } }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
