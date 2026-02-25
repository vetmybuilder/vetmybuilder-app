// web/components/account/AccountField.tsx
import React from "react";

type Props = {
  id: string;
  label: string;
  required?: boolean;

  error?: string;
  errorId?: string;

  children: React.ReactNode;
};

export default function AccountField({
  id,
  label,
  required,
  error,
  errorId,
  children,
}: Props) {
  return (
    <div>
      <label htmlFor={id} className="text-sm">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-red-600">
            *
          </span>
        )}
      </label>

      <div className="mt-1">{children}</div>

      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
