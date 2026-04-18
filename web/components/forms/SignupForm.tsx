// web/components/forms/SignupForm.tsx
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi } from "@/utils/api";
import { trackSignup } from "@/utils/analytics";
import { initFirebase } from "@/utils/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useAuth } from "@/utils/auth";
import { ensureEmailAvailable } from "@/utils/email";
import RegisterField from "./RegisterField";
import LocationField from "@/components/forms/LocationField";
import OAuthSignInButton from "@/components/forms/OAuthSignInButton";
import PasswordChecklist, {
  isStrongPassword,
} from "@/components/forms/PasswordChecklist";

type FieldErrors = Partial<
  Record<
    | "firstName"
    | "lastName"
    | "username"
    | "email"
    | "password"
    | "confirmPassword"
    | "location"
    | "betaCode",
    string
  >
>;

type FormState = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  location: string;
  betaCode: string;
};

const STRONG_PASSWORD_MESSAGE =
  "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.";

export default function SignupForm() {
  const api = useApi();
  const router = useRouter();
  const { hydrateFromSignup, refreshProfile } = useAuth();

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
    confirmPassword: "",
    location: "",
    betaCode: "",
  });

  const [betaRequired, setBetaRequired] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/api/auth/beta-status").then(({ data }) => {
      if (data?.required) setBetaRequired(true);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!passwordTrim) {
      clientErrors.password = "Password is required.";
    } else if (!isStrongPassword(form.password)) {
      clientErrors.password = STRONG_PASSWORD_MESSAGE;
    }
    if (!form.confirmPassword) {
      clientErrors.confirmPassword = "Please confirm your password.";
    } else if (form.password && form.password !== form.confirmPassword) {
      clientErrors.confirmPassword = "Passwords do not match.";
    }
    if (betaRequired && !form.betaCode.trim()) clientErrors.betaCode = "Access code is required.";

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

      await ensureEmailAvailable(api, email, betaRequired ? form.betaCode.trim() : undefined);

      // Check username availability before creating the Firebase user.
      // If we created the Firebase user first and the username were taken,
      // GuestOnly would redirect the now-signed-in user before the error renders.
      const { data: usernameCheck } = await api.get(
        "/api/auth/check-username",
        { params: { username: form.username.trim() } },
      );
      if (!usernameCheck.available) {
        setFieldErrors({ username: "That username is already taken." });
        setErr("That username is already taken.");
        return;
      }

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

      // Re-hydrate the auth context from /api/me so profileComplete flips
      // to true before we navigate. Without this, AuthedOnly on /projects
      // would see the stale profileComplete=false (set when /api/me fired
      // immediately after createUserWithEmailAndPassword, before our POST
      // /api/account had a chance to upsert the postcode) and bounce the
      // brand-new user back to /signup/complete.
      await refreshProfile();
      trackSignup("email", "homeowner");

      const target = nextPath || "/projects";

      try {
        sessionStorage.setItem("vmb:returnTo", target);
        sessionStorage.setItem("vmb:didLoginRedirect", String(Date.now()));
        if ("Notification" in window && !localStorage.getItem("vmb:pushSetupShown")) {
          sessionStorage.setItem("vmb:showPushPrompt", "1");
        }
      } catch {}

      router.replace(target);
    } catch (e: any) {
      const raw = e?.message || "";

      if (raw === "invalid_beta_code") {
        setFieldErrors({ betaCode: "Incorrect access code." });
        setErr("Invalid beta access code.");
      } else if (
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
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <OAuthSignInButton
        provider="google"
        returnTo={nextPath}
        onError={(msg) => setErr(msg)}
      />
      {process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1" && (
        <OAuthSignInButton
          provider="facebook"
          returnTo={nextPath}
          onError={(msg) => setErr(msg)}
        />
      )}

      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-zinc-400">
        <div className="h-px flex-1 bg-zinc-200" />
        <span>or sign up with email</span>
        <div className="h-px flex-1 bg-zinc-200" />
      </div>

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

      <div>
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
        <PasswordChecklist password={form.password} />
      </div>

      <RegisterField
        id="reg-pass-confirm"
        label="Confirm password"
        type="password"
        value={form.confirmPassword}
        required
        error={fieldErrors.confirmPassword}
        testIdPrefix="reg"
        onChange={(v) => set("confirmPassword", v)}
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
          error={fieldErrors.location}
        />
        {fieldErrors.location && (
          <p className="mt-1 text-sm text-red-500 font-medium" role="alert" data-testid="reg-reg-loc-error">
            {fieldErrors.location}
          </p>
        )}
      </div>

      {betaRequired && (
        <RegisterField
          id="reg-beta"
          label="Beta access code"
          value={form.betaCode}
          required
          error={fieldErrors.betaCode}
          testIdPrefix="reg"
          onChange={(v) => set("betaCode", v)}
        />
      )}

      <label className="flex items-start gap-2.5 cursor-pointer" data-testid="agree-terms">
        <input
          type="checkbox"
          checked={agreedTerms}
          onChange={(e) => setAgreedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-red-500 focus:ring-red-500"
        />
        <span className="text-xs text-zinc-500 leading-relaxed">
          By signing up, I agree to the{" "}
          <Link href="/terms" target="_blank" className="text-red-500 hover:underline">Terms of Use</Link>
          {" "}and{" "}
          <Link href="/acceptable-use" target="_blank" className="text-red-500 hover:underline">Acceptable Use Policy</Link>.
        </span>
      </label>

      {err && (
        <p className="text-red-500 text-sm font-medium" role="alert" data-testid="register-error">
          {err}
        </p>
      )}

      <button
        className="w-full inline-flex items-center justify-center rounded-full bg-red-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        type="submit"
        disabled={loading || !agreedTerms}
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
    </div>
  );
}
