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
      <label htmlFor={id} className="block text-sm font-bold text-zinc-900 mb-2">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      {children}

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-500 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
