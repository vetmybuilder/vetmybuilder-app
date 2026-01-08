// web/pages/register.tsx
import Head from "next/head";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/utils/auth";
import { ensureEmailAvailable } from "@/utils/email";

export default function Register() {
  const api = useApi();
  const router = useRouter();
  const { hydrateFromSignup } = useAuth();

  // Resolve explicit ?next= from the URL (ignore sessionStorage here)
  const explicitNext = useMemo(() => {
    if (!router.isReady) return null;
    const n = router.query.next;
    const v = typeof n === "string" ? n : Array.isArray(n) ? n[0] : "";
    return v && v.startsWith("/") ? v : null;
  }, [router.isReady, router.query.next]);

  // Default landing page after signup
  const nextPath = explicitNext || "/projects";

  // Persist next target for other parts of the flow (login etc.)
  useEffect(() => {
    try {
      if (nextPath) {
        sessionStorage.setItem("vmb:returnTo", nextPath);
      }
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const { firstName, lastName, username, email, password, location } = form;

      // Check email availability (including aliases) BEFORE hitting Firebase
      await ensureEmailAvailable(api, email.trim());

      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      try {
        await updateProfile(cred.user, {
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch {
        /* non-fatal */
      }

      await api.post("/api/account", {
        firstName,
        lastName,
        username,
        location,
      });

      hydrateFromSignup({ firstName, lastName, username, email });

      // Final redirect target after successful signup
      const target = nextPath || "/projects";

      try {
        sessionStorage.setItem("vmb:returnTo", target);
        sessionStorage.setItem("vmb:didLoginRedirect", String(Date.now()));
      } catch {}

      router.replace(target);
    } catch (e: any) {
      // Prefer our custom email message (ensureEmailAvailable) if present
      const raw = e?.message || "";

      if (
        raw.includes("already exists (including aliases)") ||
        raw.includes("already exists. Try signing in")
      ) {
        setErr(
          "An account with this email already exists. Try signing in instead."
        );
      } else if (raw.startsWith("Firebase:")) {
        // Fallback mapping for other Firebase auth errors
        if (raw.includes("auth/email-already-in-use")) {
          setErr(
            "An account with this email already exists. Try signing in instead."
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

          <label
            className="text-sm"
            htmlFor="reg-fn"
            data-testid="label-first-name"
          >
            First name
          </label>
          <input
            id="reg-fn"
            name="firstName"
            className="input"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            placeholder="First name"
            autoComplete="given-name"
            aria-required="true"
            data-testid="input-first-name"
          />

          <label
            className="text-sm"
            htmlFor="reg-ln"
            data-testid="label-last-name"
          >
            Last name
          </label>
          <input
            id="reg-ln"
            name="lastName"
            className="input"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            required
            placeholder="Last name"
            autoComplete="family-name"
            aria-required="true"
            data-testid="input-last-name"
          />

          <label
            className="text-sm"
            htmlFor="reg-un"
            data-testid="label-username"
          >
            Username <span className="sr-only">(optional)</span>
          </label>
          <input
            id="reg-un"
            name="username"
            className="input"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            placeholder="Username"
            autoComplete="username"
            data-testid="input-username"
          />

          <label
            className="text-sm"
            htmlFor="reg-email"
            data-testid="label-email"
          >
            Email
          </label>
          <input
            id="reg-email"
            name="email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            required
            placeholder="you@example.com"
            autoComplete="email"
            aria-required="true"
            data-testid="input-email"
          />

          <label
            className="text-sm"
            htmlFor="reg-pass"
            data-testid="label-password"
          >
            Password
          </label>
          <input
            id="reg-pass"
            name="password"
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            required
            placeholder="••••••••"
            autoComplete="new-password"
            aria-required="true"
            data-testid="input-password"
          />

          {/* Location at signup */}
          <label
            className="text-sm"
            htmlFor="reg-loc"
            data-testid="label-location"
          >
            Postcode or City/Borough (for local recommendations)
          </label>
          <input
            id="reg-loc"
            name="location"
            className="input"
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            required
            placeholder="e.g. E4 or E4 8NJ or Chingford"
            autoComplete="address-line1"
            aria-required="true"
            data-testid="input-location"
          />

          {err && (
            <p
              className="text-red-600"
              role="alert"
              data-testid="register-error"
            >
              {err}
            </p>
          )}

          <button
            className="btn"
            type="submit"
            disabled={loading}
            aria-label="Create account"
            aria-describedby="register-title"
            data-testid="btn-create-account"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          <p className="text-sm text-slate-600" data-testid="register-to-login">
            Already have an account?{" "}
            <Link
              className="link"
              href={{ pathname: "/login", query: { next: nextPath } }}
              data-testid="link-to-login"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
