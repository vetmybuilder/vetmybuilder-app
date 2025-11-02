// web/components/forms/DescriptionBuilder.tsx
import * as React from "react";
import Select from "@/components/forms/Select";

type Props = {
  value: string; // current description text
  onChange: (next: string) => void;
  className?: string;
  "data-testid"?: string;
};

type Chip = { label: string; value: string };

const TIMEFRAMES = [
  "Urgent (1–2 weeks)",
  "Soon (2–4 weeks)",
  "This quarter (1–3 months)",
  "Flexible (3+ months)",
];

const BUDGETS = ["Under £5k", "£5k–£15k", "£15k–£30k", "£30k–£60k", "£60k+"];

const ACCESS_CHIPS: Chip[] = [
  { label: "Weekdays", value: "Weekdays" },
  { label: "Weekends only", value: "Weekends only" },
  { label: "Evenings OK", value: "Evenings OK" },
  { label: "Owner at home", value: "Owner at home" },
  { label: "Keys can be provided", value: "Keys can be provided" },
  { label: "Parking available", value: "Parking available" },
  { label: "Parking permit needed", value: "Parking permit needed" },
  { label: "Limited access", value: "Limited access" },
];

const MATERIALS_OPTIONS = [
  "Supplied by tradesman",
  "Supplied by homeowner",
  "Mixed (some provided)",
];

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function ChipToggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`px-3 py-1.5 rounded-full border text-sm transition ${
        checked
          ? "border-indigo-300 bg-indigo-50"
          : "border-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function DescriptionBuilder({
  value,
  onChange,
  className = "",
  "data-testid": testId,
}: Props) {
  // local structured fields
  const [timeframe, setTimeframe] = React.useState<string>("");
  const [budget, setBudget] = React.useState<string>("");
  const [materials, setMaterials] = React.useState<string>("");
  const [access, setAccess] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState<string>("");

  // Compose a friendly, readable description
  const composed = React.useMemo(() => {
    const lines: string[] = [];

    if (timeframe) lines.push(`Timeframe: ${timeframe}.`);
    if (budget) lines.push(`Budget: ${budget}.`);
    if (materials) lines.push(`Materials: ${materials}.`);
    if (access.length > 0) lines.push(`Access: ${access.join(", ")}.`);

    const extra = normalize(notes);
    if (extra) lines.push(extra);

    return lines.join("\n");
  }, [timeframe, budget, materials, access, notes]);

  // Emit changes upward automatically
  React.useEffect(() => {
    onChange(composed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composed]);

  // If the parent had an existing free-text value, we leave it as-is in preview.
  // We don't attempt to parse it back into fields to avoid guesswork.

  function toggleAccess(v: string) {
    setAccess((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  return (
    <div className={className} data-testid={testId || "description-builder"}>
      {/* Timeframe */}
      <div>
        <Select
          id="db-timeframe"
          label="Desired timeframe"
          placeholder="Select timeframe"
          value={timeframe || null}
          onChange={(v) => setTimeframe(v)}
          options={TIMEFRAMES}
          data-testid="db-timeframe"
        />
      </div>

      {/* Budget */}
      <div className="mt-3">
        <Select
          id="db-budget"
          label="Estimated budget"
          placeholder="Select a budget band"
          value={budget || null}
          onChange={(v) => setBudget(v)}
          options={BUDGETS}
          data-testid="db-budget"
        />
      </div>

      {/* Materials */}
      <div className="mt-3">
        <Select
          id="db-materials"
          label="Materials"
          placeholder="Who will supply materials?"
          value={materials || null}
          onChange={(v) => setMaterials(v)}
          options={MATERIALS_OPTIONS}
          data-testid="db-materials"
        />
      </div>

      {/* Access */}
      <div className="mt-3">
        <div className="text-xs text-slate-500 mb-1">Access constraints</div>
        <div className="flex flex-wrap gap-2" data-testid="db-access">
          {ACCESS_CHIPS.map((c) => (
            <ChipToggle
              key={c.value}
              checked={access.includes(c.value)}
              onChange={() => toggleAccess(c.value)}
            >
              {c.label}
            </ChipToggle>
          ))}
        </div>
      </div>

      {/* Extra notes */}
      <div className="mt-4">
        <label htmlFor="db-notes" className="text-xs text-slate-500">
          Extra notes (optional)
        </label>
        <textarea
          id="db-notes"
          className="input min-h-32 mt-1"
          placeholder="Anything else the tradesman should know (rooms, scope highlights, timing specifics, constraints, etc.)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="db-notes"
        />
      </div>

      {/* Live preview */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          Preview
        </div>
        <p
          className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-900 text-sm"
          data-testid="db-preview"
        >
          {composed || value || "Your description will appear here…"}
        </p>
      </div>
    </div>
  );
}
