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
import { flushPendingProject } from "@/utils/flushPendingProject";
import RegisterField from "./RegisterField";
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
    betaCode: "",
  });

  const [betaRequired, setBetaRequired] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Homeowner signups are gated by BETA_CODE pre-launch. Trader signup
    // hits the same endpoint with role=trader and is never gated.
    api.get("/api/auth/beta-status?role=homeowner").then(({ data }) => {
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
    idToken: string;
  }) {
    const payload = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username: input.username.trim(),
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

    const clientErrors: FieldErrors = {};
    if (!firstNameTrim) clientErrors.firstName = "First name is required.";
    if (!lastNameTrim) clientErrors.lastName = "Last name is required.";
    if (!usernameTrim) clientErrors.username = "Username is required.";
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

      await ensureEmailAvailable(api, email, betaRequired ? form.betaCode.trim() : undefined, "homeowner");

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
        idToken,
      });

      if (!saved) return;

      hydrateFromSignup({
        firstName: saved.firstName,
        lastName: saved.lastName,
        username: saved.username,
        email,
      });

      // Set the push-prompt flag BEFORE refreshProfile so that when
      // profileComplete flips to true, PushPromptMount's effect picks
      // it up on the same tick. Setting it after refreshProfile would
      // miss the trigger (effect already ran with no flag).
      try {
        if ("Notification" in window && !localStorage.getItem("vmb:pushSetupShown")) {
          sessionStorage.setItem("vmb:showPushPrompt", "1");
        }
      } catch {}

      // Re-hydrate the auth context from /api/me so profileComplete flips
      // to true before we navigate. Without this, AuthedOnly on /projects
      // would see the stale profileComplete=false (set when /api/me fired
      // immediately after createUserWithEmailAndPassword, before our POST
      // /api/account had a chance to upsert the postcode) and bounce the
      // brand-new user back to /signup/complete.
      await refreshProfile();
      trackSignup("email", "homeowner");

      // Flush a pending project payload (guest started the wizard at
      // /projects/new, hit submit, got bounced here). See
      // utils/flushPendingProject.ts for the contract.
      const pendingTarget = await flushPendingProject(api);
      const target = pendingTarget || nextPath || "/projects";

      try {
        sessionStorage.setItem("vmb:returnTo", target);
        sessionStorage.setItem("vmb:didLoginRedirect", String(Date.now()));
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
        intent="homeowner"
        onError={(msg) => setErr(msg)}
      />

      <p
        className="text-center text-[12.5px] text-slate-500"
        data-testid="signup-already-member"
      >
        Already a member?{" "}
        <Link
          href={{ pathname: "/login", query: { next: nextPath } }}
          className="font-extrabold text-indigo-700 hover:underline"
          data-testid="signup-signin-link"
        >
          Sign in
        </Link>
      </p>

      <div className="flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-slate-400 font-bold">
        <div className="h-px flex-1 bg-slate-200" />
        <span>or sign up with email</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

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
        All fields marked as required must be completed to create your account.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <RegisterField
          id="reg-fn"
          label="First name"
          value={form.firstName}
          required
          error={fieldErrors.firstName}
          testIdPrefix="reg"
          placeholder="Sarah"
          autoComplete="given-name"
          onChange={(v) => set("firstName", v)}
        />

        <RegisterField
          id="reg-ln"
          label="Last name"
          value={form.lastName}
          required
          error={fieldErrors.lastName}
          testIdPrefix="reg"
          placeholder="Johnson"
          autoComplete="family-name"
          onChange={(v) => set("lastName", v)}
        />
      </div>

      <RegisterField
        id="reg-email"
        label="Email"
        type="email"
        value={form.email}
        required
        error={fieldErrors.email}
        testIdPrefix="reg"
        placeholder="you@example.com"
        autoComplete="email"
        onChange={(v) => set("email", v)}
      />

      <RegisterField
        id="reg-un"
        label="Username"
        value={form.username}
        required
        error={fieldErrors.username}
        testIdPrefix="reg"
        autoComplete="username"
        onChange={(v) => set("username", v)}
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
          placeholder="••••••••"
          autoComplete="new-password"
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
        placeholder="••••••••"
        autoComplete="new-password"
        onChange={(v) => set("confirmPassword", v)}
      />

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

      <label className="flex items-start gap-2.5 cursor-pointer mt-2" data-testid="agree-terms">
        <input
          type="checkbox"
          checked={agreedTerms}
          onChange={(e) => setAgreedTerms(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="text-[12px] text-slate-500 leading-relaxed">
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="text-indigo-600 hover:underline">Terms of Use</Link>
          {" "}and{" "}
          <Link href="/acceptable-use" target="_blank" className="text-indigo-600 hover:underline">Acceptable Use Policy</Link>.
        </span>
      </label>

      {err && (
        <p className="text-red-500 text-sm font-medium" role="alert" data-testid="register-error">
          {err}
        </p>
      )}

      <button
        className="w-full inline-flex items-center justify-center gap-2 py-4 rounded-2xl text-white font-extrabold text-[15px] tracking-tight shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100"
        style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
        type="submit"
        disabled={loading || !agreedTerms}
      >
        {loading && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" /></svg>}
        {loading ? "Creating…" : "Create account"}
      </button>

      </form>
    </div>
  );
}
