// web/components/forms/RegisterField.tsx
import type { ChangeEvent } from "react";

type Props = {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  required?: boolean;
  error?: string;
  testIdPrefix?: string; // e.g. "reg"
  placeholder?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
};

export default function RegisterField({
  id,
  label,
  type = "text",
  value,
  required,
  error,
  testIdPrefix,
  placeholder,
  autoComplete,
  onChange,
}: Props) {
  const errId = `${id}-err`;
  const errorTestId = testIdPrefix ? `${testIdPrefix}-${id}-error` : undefined;

  return (
    <div>
      <label
        className="block text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5"
        htmlFor={id}
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full rounded-xl border bg-slate-50 px-4 py-3.5 text-slate-900 placeholder:text-slate-400 text-[14px] focus:bg-white focus:outline-none focus:ring-4 transition-colors ${
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500/15"
            : "border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/15"
        }`}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        required={required}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errId : undefined}
      />

      {error && (
        <p
          id={errId}
          className="mt-1 text-sm text-red-500 font-medium"
          data-testid={errorTestId}
        >
          {error}
        </p>
      )}
    </div>
  );
}
