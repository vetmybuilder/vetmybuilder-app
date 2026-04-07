// web/components/vendor-register/Step4Account.tsx
import PasswordChecklist from "@/components/forms/PasswordChecklist";

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

const inputClass = "w-full rounded-2xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-red-400 focus:outline-none transition-colors";
const labelClass = "block text-sm font-bold text-zinc-900 mb-2";

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
    <form className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 grid gap-5" onSubmit={onCreate} data-testid="step-4">
      <div>
        <h2 className="text-xl font-black text-zinc-900">Create your account</h2>
        <p className="mt-1 text-sm text-zinc-500">
          You'll use <span className="font-bold text-zinc-700">{email || "(missing email)"}</span> to sign in.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="reg-pass" data-testid="label-password">
          Password
        </label>
        <input
          id="reg-pass"
          name="password"
          type="password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="new-password"
          data-testid="input-password"
        />
        <PasswordChecklist password={password} />
      </div>

      <div>
        <label className={labelClass} htmlFor="reg-pass2" data-testid="label-password-2">
          Confirm password
        </label>
        <input
          id="reg-pass2"
          name="confirmPassword"
          type="password"
          className={inputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="new-password"
          data-testid="input-password-confirm"
        />
      </div>

      {err && (
        <p className="text-sm text-red-500 font-medium" role="alert" data-testid="create-error">
          {err}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border-2 border-zinc-200 bg-white px-6 py-3 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-all"
          onClick={onBack}
          data-testid="btn-back-2"
        >
          Back
        </button>
        <button
          className="inline-flex items-center justify-center rounded-full bg-red-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-500/25 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          disabled={busy}
          data-testid="btn-create-account"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </div>

      <p className="text-sm text-zinc-500 text-center" data-testid="vendor-already-member-3">
        Already have an account?{" "}
        <a
          className="font-bold text-red-500 hover:text-red-600"
          href={`/login?next=${encodeURIComponent("/tradesman/projects")}&email=${encodeURIComponent(email || "")}`}
          data-testid="link-vendor-signin-3"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}
