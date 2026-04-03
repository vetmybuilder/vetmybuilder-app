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
  onChange,
}: Props) {
  const errId = `${id}-err`;
  const errorTestId = testIdPrefix ? `${testIdPrefix}-${id}-error` : undefined;

  return (
    <div>
      <label className="block text-sm font-bold text-zinc-900 mb-2" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        type={type}
        className={`w-full rounded-2xl border-2 px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors ${
          error
            ? "border-red-400 focus:border-red-500"
            : "border-zinc-200 focus:border-red-400"
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
