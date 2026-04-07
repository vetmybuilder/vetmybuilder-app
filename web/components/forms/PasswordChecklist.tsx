// web/components/forms/PasswordChecklist.tsx
//
// Reusable password-strength checklist. Same look as the reset-password page —
// each rule shows as a green check when satisfied, otherwise a faint info icon.
// Used by the homeowner signup form, the tradesman signup form, and (eventually)
// the reset-password page.

import * as React from "react";

export type PasswordRule = {
  label: string;
  pass: (pw: string) => boolean;
};

export const PASSWORD_RULES: PasswordRule[] = [
  { label: "At least 8 characters",        pass: (pw) => pw.length >= 8 },
  { label: "One uppercase letter (A–Z)",   pass: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter (a–z)",   pass: (pw) => /[a-z]/.test(pw) },
  { label: "One number (0–9)",             pass: (pw) => /[0-9]/.test(pw) },
  { label: "One special character (!@#…)", pass: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.pass(password));
}

type Props = {
  password: string;
  /**
   * When false (default), the checklist only renders once the user has typed
   * at least one character. Pass `true` to always show.
   */
  alwaysShow?: boolean;
  className?: string;
};

export default function PasswordChecklist({
  password,
  alwaysShow = false,
  className = "",
}: Props) {
  if (!alwaysShow && password.length === 0) return null;

  return (
    <ul
      className={`mt-3 space-y-1.5 ${className}`}
      data-testid="password-checklist"
    >
      {PASSWORD_RULES.map((rule) => {
        const pass = rule.pass(password);
        return (
          <li
            key={rule.label}
            className={`flex items-center gap-2 text-xs transition-colors ${
              pass ? "text-emerald-600" : "text-zinc-400"
            }`}
          >
            {pass ? (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5 shrink-0 opacity-40"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
