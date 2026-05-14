// web/components/forms/DynamicFieldGroup.tsx
//
// Renders one FieldGroup from web/config/jobFields.ts. Produces a partial
// answers object keyed by the group id (e.g. `{ flooring: { ... } }`) so
// the parent form just spreads it into the final payload.
//
// Kinds supported in this MVP slice: number, select, boolean, either.
// Unknown kinds render nothing (forward-compat).

import * as React from "react";
import type {
  AnswersShape,
  Field,
  FieldGroup,
  SelectField,
} from "@/config/jobFields";

type Props = {
  group: FieldGroup;
  value: AnswersShape; // full answers object (so `showIf` can look cross-field)
  onChange: (next: AnswersShape) => void;
  errors?: Record<string, string>; // keyed by `${groupId}.${fieldKey}`
};

export default function DynamicFieldGroup({
  group,
  value,
  onChange,
  errors = {},
}: Props) {
  const groupAnswers = value[group.id] || {};

  const setField = (key: string, next: any) => {
    onChange({
      ...value,
      [group.id]: { ...groupAnswers, [key]: next },
    });
  };

  // Keep state clean: when a conditional field (showIf) becomes hidden, drop
  // its stored value so we never persist a value the user can no longer see.
  React.useEffect(() => {
    let changed = false;
    let next = groupAnswers;
    for (const field of group.fields) {
      const hasShowIf = field.kind === "select" && field.showIf;
      if (!hasShowIf) continue;
      const hidden = !(field as SelectField).showIf!(value);
      if (hidden && field.key in (groupAnswers || {})) {
        if (!changed) {
          next = { ...(groupAnswers || {}) };
          changed = true;
        }
        delete (next as any)[field.key];
      }
    }
    if (changed) {
      onChange({ ...value, [group.id]: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <section
      aria-label={group.title}
      data-testid={`dynamic-group-${group.id}`}
      className="space-y-5"
    >
      {group.fields.map((field) => {
        if (field.kind === "select" && field.showIf && !field.showIf(value)) {
          return null;
        }
        const path = `${group.id}.${field.key}`;
        const error = errors[path];
        return (
          <div key={field.key} className="space-y-1">
            <FieldRenderer
              field={field}
              value={groupAnswers[field.key]}
              onChange={(v) => setField(field.key, v)}
              testIdBase={`field-${group.id}-${field.key}`}
            />
            {error && (
              <p className="text-xs text-red-600" data-testid={`error-${path}`}>
                {error}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  testIdBase,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
  testIdBase: string;
}) {
  if (field.kind === "number") {
    const unitLabel =
      field.unit === "m2" ? "m\u00B2" : field.unit === "count" ? "" : "";
    return (
      <label className="block">
        <span className="block text-sm font-semibold text-zinc-700 mb-2">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            className="w-44 rounded-xl border-2 border-zinc-200 px-4 py-3 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none transition-colors"
            value={value ?? ""}
            min={0}
            onChange={(e) => {
              const raw = e.target.value;
              onChange(raw === "" ? null : Number(raw));
            }}
            data-testid={testIdBase}
          />
          {unitLabel && (
            <span className="text-sm font-medium text-zinc-500">{unitLabel}</span>
          )}
        </div>
        {field.help && (
          <span className="mt-1.5 block text-xs text-zinc-400">{field.help}</span>
        )}
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <div>
        <span className="block text-sm font-semibold text-zinc-700 mb-2">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => {
            const selected = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(selected ? null : o.value)}
                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  selected
                    ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
                data-testid={`${testIdBase}-${o.value}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {field.help && (
          <span className="mt-1.5 block text-xs text-zinc-400">{field.help}</span>
        )}
      </div>
    );
  }

  if (field.kind === "boolean") {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
          value === true
            ? "border-indigo-500 bg-indigo-50 text-indigo-800"
            : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
        }`}
        data-testid={testIdBase}
      >
        <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 text-[10px] font-bold ${
          value === true ? "bg-indigo-500 border-indigo-500 text-white" : "border-zinc-300"
        }`}>
          {value === true && "\u2713"}
        </span>
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </button>
    );
  }

  if (field.kind === "either") {
    const current: { kind: string; value: number } | null =
      value && typeof value === "object" && value.kind ? value : null;
    const activeKind = current?.kind ?? field.branches[0].key;
    const currentValue = current?.value ?? "";

    return (
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-zinc-700">
          {field.branches[0].label} <em className="text-zinc-400">or</em>{" "}
          {field.branches[1].label}
          {field.required && <span className="text-red-500"> *</span>}
        </legend>
        <div className="flex flex-wrap items-center gap-2">
          {field.branches.map((branch) => (
            <label
              key={branch.key}
              data-testid={`${testIdBase}-kind-${branch.key}-label`}
              className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                activeKind === branch.key
                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
              }`}
            >
              <input
                type="radio"
                name={testIdBase}
                checked={activeKind === branch.key}
                onChange={() =>
                  onChange({
                    kind: branch.key,
                    value: currentValue === "" ? null : Number(currentValue),
                  })
                }
                className="sr-only"
                data-testid={`${testIdBase}-kind-${branch.key}`}
              />
              {branch.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="w-44 rounded-xl border-2 border-zinc-200 px-4 py-3 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none transition-colors"
            value={currentValue}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                kind: activeKind,
                value: raw === "" ? null : Number(raw),
              });
            }}
            data-testid={`${testIdBase}-value`}
          />
          <span className="text-sm font-medium text-zinc-500">
            {activeKind === "m2"
              ? "m\u00B2"
              : activeKind === "rooms"
                ? "rooms"
                : ""}
          </span>
        </div>
        {field.help && (
          <span className="block text-xs text-zinc-400">{field.help}</span>
        )}
      </fieldset>
    );
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────
// Client-side validation — mirrors server/lib/jobFields.js::validateAnswers.
// Returns a map of path → error message (empty if valid).
// ──────────────────────────────────────────────────────────────────

export function validateGroup(
  group: FieldGroup,
  answers: AnswersShape,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const groupAnswers = answers[group.id] || {};

  for (const field of group.fields) {
    if (field.kind === "select" && field.showIf && !field.showIf(answers)) {
      continue; // hidden field — don't validate
    }
    const val = (groupAnswers as any)[field.key];
    const path = `${group.id}.${field.key}`;

    if (field.kind === "either") {
      if (field.required) {
        const ok =
          val &&
          typeof val === "object" &&
          typeof val.kind === "string" &&
          Number.isFinite(Number(val.value));
        if (!ok) errors[path] = "Please enter a value";
      }
      continue;
    }

    if (
      field.required &&
      (val === undefined || val === null || val === "")
    ) {
      errors[path] = "Required";
    }
  }
  return errors;
}
