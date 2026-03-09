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

  const inputClassName = `input ${
    error ? "!border-red-600 !ring-red-600 ring-1" : ""
  }`;

  return (
    <>
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        type={type}
        className={inputClassName}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        required={required}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errId : undefined}
      />

      {error && (
        <p
          id={errId}
          className="text-sm text-red-600"
          data-testid={errorTestId}
        >
          {error}
        </p>
      )}
    </>
  );
}
