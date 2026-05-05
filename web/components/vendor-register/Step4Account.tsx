// web/components/vendor-register/Step4Account.tsx
import { useState } from "react";
import Link from "next/link";
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

const inputClass = "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors";
const labelClass = "block text-[10.5px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5";

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
  const [agreedTerms, setAgreedTerms] = useState(false);

  return (
    <form className="space-y-0 pb-4" onSubmit={onCreate} data-testid="step-4">
      {/* Step heading */}
      <div className="px-3.5 pt-4 pb-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 mb-0.5">
          Account
        </p>
        <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight">Almost there</h2>
        <p className="mt-1 text-sm text-zinc-500">
          You'll use <span className="font-bold text-zinc-700">{email || "(missing email)"}</span> to sign in.
        </p>
      </div>

      {/* Password fields card */}
      <div className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3 space-y-4">
        <div>
          <label className={labelClass} htmlFor="reg-pass" data-testid="label-password">
            Password <span className="text-red-500">*</span>
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
            Confirm password <span className="text-red-500">*</span>
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
      </div>

      {/* Terms card */}
      <div className="bg-white rounded-xl mx-3 my-2 px-3.5 py-3">
        <label className="flex items-start gap-2.5 cursor-pointer" data-testid="agree-terms">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-xs text-zinc-500 leading-relaxed">
            By signing up, I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-emerald-600 hover:underline">Terms of Use</Link>
            {" "}and{" "}
            <Link href="/acceptable-use" target="_blank" className="text-emerald-600 hover:underline">Acceptable Use Policy</Link>.
          </span>
        </label>
      </div>

      {err && (
        <p className="mx-3 text-sm text-red-500 font-medium" role="alert" data-testid="create-error">
          {err}
        </p>
      )}

      <p className="text-sm text-zinc-500 text-center pb-2" data-testid="vendor-already-member-3">
        Already have an account?{" "}
        <a
          className="font-bold text-emerald-600 hover:text-emerald-700"
          href={`/login?next=${encodeURIComponent("/tradesman/jobs")}&email=${encodeURIComponent(email || "")}`}
          data-testid="link-vendor-signin-3"
        >
          Sign in
        </a>
      </p>

      {/* Hidden submit — triggered by WizardNavBar onNext. The
          agreedTerms gate is enforced via nextDisabled on the NavBar. */}
      <button type="submit" className="sr-only" data-testid="btn-create-account" aria-hidden="true">Create account</button>
    </form>
  );
}
