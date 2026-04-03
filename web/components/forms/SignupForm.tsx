// web/components/forms/SignupForm.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/utils/auth";
import { ensureEmailAvailable } from "@/utils/email";
import RegisterField from "./RegisterField";
import LocationField from "@/components/forms/LocationField";

type FieldErrors = Partial<
  Record<
    "firstName" | "lastName" | "username" | "email" | "password" | "location",
    string
  >
>;

type FormState = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  location: string;
};

export default function SignupForm() {
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

  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    location: "",
  });

  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormState, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  async function postAccountWithBearer(input: {
    firstName: string;
    lastName: string;
    username: string;
    location: string;
    idToken: string;
  }) {
    const payload = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username: input.username.trim(),
      location: input.location.trim(),
    };

    const res = await fetch("/api/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.idToken}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (res.ok) return payload;

    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    if (res.status === 400 && body?.fieldErrors) {
      setFieldErrors(body.fieldErrors as FieldErrors);
      setErr(body?.message || "Please fill in all required fields.");
      return null;
    }

    if (res.status === 409 && body?.error === "username_taken") {
      setFieldErrors({ username: "That username is already taken." });
      setErr(body?.message || "That username is already taken.");
      return null;
    }

    throw new Error(
      body?.message || body?.error || `Registration failed: ${res.status}`,
    );
  }

  function isValidEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function validateClient(): FieldErrors {
    const firstNameTrim = form.firstName.trim();
    const lastNameTrim = form.lastName.trim();
    const usernameTrim = form.username.trim();
    const emailTrim = form.email.trim();
    const passwordTrim = form.password.trim();
    const locationTrim = form.location.trim();

    const clientErrors: FieldErrors = {};
    if (!firstNameTrim) clientErrors.firstName = "First name is required.";
    if (!lastNameTrim) clientErrors.lastName = "Last name is required.";
    if (!usernameTrim) clientErrors.username = "Username is required.";
    if (!locationTrim) clientErrors.location = "Postcode or city is required.";
    if (!emailTrim) clientErrors.email = "Email is required.";
    if (emailTrim && !isValidEmail(emailTrim)) {
      clientErrors.email = "Enter a valid email address.";
    }
    if (!passwordTrim) clientErrors.password = "Password is required.";

    return clientErrors;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setFieldErrors({});
    setLoading(true);

    const clientErrors = validateClient();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setErr("Please fill in all required fields.");
      setLoading(false);
      return;
    }

    try {
      const email = form.email.trim();

      await ensureEmailAvailable(api, email);

      const auth = initFirebase();
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        form.password,
      );

      try {
        await updateProfile(cred.user, {
          displayName: `${form.firstName} ${form.lastName}`.trim(),
        });
      } catch {}

      const idToken = await cred.user.getIdToken(true);

      const saved = await postAccountWithBearer({
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        location: form.location,
        idToken,
      });

      if (!saved) return;

      hydrateFromSignup({
        firstName: saved.firstName,
        lastName: saved.lastName,
        username: saved.username,
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
        } else if (raw.includes("auth/invalid-email")) {
          setFieldErrors((p) => ({
            ...p,
            email: "Enter a valid email address.",
          }));
          setErr("Please double-check your details.");
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
    <form
      className="grid gap-4"
      onSubmit={onSubmit}
      noValidate
      aria-label="Create account form"
      aria-describedby="register-help"
      aria-busy={loading ? "true" : "false"}
      data-testid="register-form"
    >
      <p id="register-help" className="sr-only">
        All fields marked as required must be completed to create your account.
      </p>

      <RegisterField
        id="reg-fn"
        label="First name"
        value={form.firstName}
        required
        error={fieldErrors.firstName}
        testIdPrefix="reg"
        onChange={(v) => set("firstName", v)}
      />

      <RegisterField
        id="reg-ln"
        label="Last name"
        value={form.lastName}
        required
        error={fieldErrors.lastName}
        testIdPrefix="reg"
        onChange={(v) => set("lastName", v)}
      />

      <RegisterField
        id="reg-un"
        label="Username"
        value={form.username}
        required
        error={fieldErrors.username}
        testIdPrefix="reg"
        onChange={(v) => set("username", v)}
      />

      <RegisterField
        id="reg-email"
        label="Email"
        type="email"
        value={form.email}
        required
        error={fieldErrors.email}
        testIdPrefix="reg"
        onChange={(v) => set("email", v)}
      />

      <RegisterField
        id="reg-pass"
        label="Password"
        type="password"
        value={form.password}
        required
        error={fieldErrors.password}
        testIdPrefix="reg"
        onChange={(v) => set("password", v)}
      />

      <div>
        <LocationField
          id="reg-loc"
          label="Postcode or City/Borough"
          placeholder="e.g., E4, N17, Chingford"
          value={form.location}
          onChange={(v, meta) => {
            if (meta) {
              const token = meta.outward || meta.sector || meta.postcode || v;
              set("location", token);
            } else {
              set("location", v);
            }
          }}
          dataTestId="reg-reg-loc"
          reasonText=""
        />
        {fieldErrors.location && (
          <p className="mt-1 text-sm text-red-500 font-medium" role="alert">
            {fieldErrors.location}
          </p>
        )}
      </div>

      {err && (
        <p className="text-red-500 text-sm font-medium" role="alert" data-testid="register-error">
          {err}
        </p>
      )}

      <button
        className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        type="submit"
        disabled={loading}
      >
        {loading ? "Creating…" : "Create account"}
      </button>

      <p className="text-sm text-zinc-500 text-center">
        Already have an account?{" "}
        <Link
          href={{ pathname: "/login", query: { next: nextPath } }}
          className="font-bold text-red-500 hover:text-red-600"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
