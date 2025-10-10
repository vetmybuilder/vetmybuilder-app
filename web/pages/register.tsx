// web/pages/register.tsx
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/utils/auth";

export default function Register() {
  const api = useApi();
  const router = useRouter();
  const { hydrateFromSignup } = useAuth();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    location: "", // NEW: postcode/city at signup
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

      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      try {
        await updateProfile(cred.user, {
          displayName: `${firstName} ${lastName}`.trim(),
        });
      } catch {
        // non-fatal
      }

      // include location so server writes it to users table
      await api.post("/api/account", {
        firstName,
        lastName,
        username,
        location,
      });

      // Optimistically seed auth context so initials render immediately
      hydrateFromSignup({ firstName, lastName, username, email });

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

          {/* NEW: Location at signup */}
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
            <Link className="link" href="/login" data-testid="link-to-login">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
