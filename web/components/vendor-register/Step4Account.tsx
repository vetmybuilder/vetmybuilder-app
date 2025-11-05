// web/components/vendor-register/Step4Account.tsx
type Props = {
  email: string;
  password: string;
  confirmPassword: string;
  setPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  onBack: () => void;
  onCreate: (e: React.FormEvent) => void;
  busy?: boolean;
  err?: string | null;
};

export default function Step4Account({
  email,
  password,
  confirmPassword,
  setPassword,
  setConfirmPassword,
  onBack,
  onCreate,
  busy,
  err,
}: Props) {
  return (
    <form className="card grid gap-3" onSubmit={onCreate} data-testid="step-4">
      <h2 className="text-lg font-medium">Create your account</h2>
      <p className="text-sm text-slate-600">
        Use the email{" "}
        <span className="font-medium">{email || "(missing email)"}</span> to
        sign in later.
      </p>

      <label
        className="text-sm"
        htmlFor="reg-pass"
        data-testid="label-password"
      >
        Password (min 8 chars)
      </label>
      <input
        id="reg-pass"
        name="password"
        type="password"
        className="input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        placeholder="••••••••"
        autoComplete="new-password"
        data-testid="input-password"
      />

      <label
        className="text-sm"
        htmlFor="reg-pass2"
        data-testid="label-password-2"
      >
        Confirm password
      </label>
      <input
        id="reg-pass2"
        name="confirmPassword"
        type="password"
        className="input"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        placeholder="••••••••"
        autoComplete="new-password"
        data-testid="input-password-confirm"
      />

      {err && (
        <p
          className="text-sm text-red-600"
          role="alert"
          data-testid="create-error"
        >
          {err}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="rounded-xl px-4 py-2 text-sm bg-white ring-1 ring-slate-200 hover:bg-slate-50"
          onClick={onBack}
          data-testid="btn-back-2"
        >
          Back
        </button>
        <button
          className="rounded-xl px-4 py-2 text-sm bg-slate-900 text-white hover:bg-slate-800"
          disabled={busy}
          data-testid="btn-create-account"
        >
          {busy ? "Creating…" : "Create Account"}
        </button>
      </div>

      <p
        className="text-sm text-slate-600"
        data-testid="vendor-already-member-3"
      >
        Already have an account?{" "}
        <a
          className="link"
          href={`/login?next=${encodeURIComponent(
            "/tradesman/projects"
          )}&email=${encodeURIComponent(email || "")}`}
          data-testid="link-vendor-signin-3"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}
