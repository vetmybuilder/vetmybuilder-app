// web/components/forms/DescriptionBuilder.tsx

import * as React from "react";
import Select from "@/components/forms/Select";

type Props = {
  value: string;
  onChange: (next: string) => void;
  category?: string | null;
  className?: string;
  "data-testid"?: string;
};

type Chip = { label: string; value: string };

const TIMEFRAMES = [
  "Urgent (1-2 weeks)",
  "Soon (2–4 weeks)",
  "This quarter (1–3 months)",
  "Flexible (3+ months)",
];

const BUDGETS = ["Under £5k", "£5k–£15k", "£15k–£30k", "£30k-£60k", "£60k+"];

//
// ACCESS CHIP GROUPS
//
const INSULATION_ACCESS_CHIPS: Chip[] = [
  { label: "Side access available", value: "side_access_available" },
  { label: "Narrow side access (<800mm)", value: "narrow_side_access" },
  { label: "Rear access available", value: "rear_access_available" },
  { label: "No rear access", value: "no_rear_access" },
  { label: "Scaffolding required", value: "scaffolding_required" },
  { label: "Scaffolding already present", value: "scaffolding_present" },

  { label: "Loft easy to access", value: "loft_easy" },
  { label: "Restricted loft height", value: "loft_restricted" },
  { label: "Boarded loft", value: "loft_boarded" },
  { label: "Small loft hatch", value: "small_loft_hatch" },

  { label: "Parking close to property", value: "parking_close" },
  { label: "Long hose needed (no close parking)", value: "long_hose_needed" },

  { label: "Asbestos suspected", value: "asbestos_suspected" },
  { label: "Waste removal needed", value: "waste_removal" },
];

const CONSTRUCTION_ACCESS_CHIPS: Chip[] = [
  { label: "Skip can be placed on driveway", value: "skip_driveway" },
  { label: "Skip must be placed on road", value: "skip_road" },
  { label: "Scaffolding required", value: "scaffolding_required" },
  { label: "Rear access available", value: "rear_access" },
  { label: "No rear access", value: "no_rear_access" },
  { label: "Parking available", value: "parking_available" },
  { label: "Permit required", value: "permit_required" },
];

const GENERAL_ACCESS_CHIPS: Chip[] = [
  { label: "Easy access", value: "easy_access" },
  { label: "Restricted access", value: "restricted_access" },
  { label: "Parking available", value: "parking_available" },
  { label: "Street parking only", value: "street_parking" },
  { label: "Permit required", value: "permit_required" },
  { label: "Pets at home", value: "pets" },
  { label: "Someone home to let in", value: "someone_home" },
  { label: "Keys can be left", value: "keys_left" },
];

function getAccessChips(category: string | null | undefined): Chip[] {
  if (!category) return GENERAL_ACCESS_CHIPS;

  if (category === "Insulation") {
    return INSULATION_ACCESS_CHIPS;
  }

  if (
    category === "Extensions & Conversions" ||
    category === "Roofing" ||
    category === "Exterior & Structure" ||
    category === "Masonry & Structural"
  ) {
    return CONSTRUCTION_ACCESS_CHIPS;
  }

  return GENERAL_ACCESS_CHIPS;
}

const MATERIALS_OPTIONS = [
  "Supplied by tradesman",
  "Supplied by homeowner",
  "Mixed (some provided)",
];

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function stripTrailingPeriod(s: string) {
  return s.replace(/\.\s*$/, "").trim();
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
  category = null,
  className = "",
  "data-testid": testId,
}: Props) {
  const [timeframe, setTimeframe] = React.useState("");
  const [budget, setBudget] = React.useState("");
  const [materials, setMaterials] = React.useState("");
  const [access, setAccess] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState("");

  const ACCESS_CHIPS = React.useMemo(
    () => getAccessChips(category),
    [category],
  );

  function toggleAccess(v: string) {
    setAccess((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
    );
  }

  // ✅ Hydrate from existing `value` (edit flow) so controls are pre-populated.
  React.useEffect(() => {
    const v = String(value || "").trim();
    if (!v) return;

    // Only hydrate if user hasn't interacted yet
    if (
      timeframe ||
      budget ||
      materials ||
      access.length > 0 ||
      notes.trim().length > 0
    ) {
      return;
    }

    const lines = v
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);

    let nextTimeframe = "";
    let nextBudget = "";
    let nextMaterials = "";
    let nextAccessValues: string[] = [];
    const noteLines: string[] = [];

    const labelToValue = ACCESS_CHIPS.reduce<Record<string, string>>(
      (acc, chip) => {
        acc[chip.label.toLowerCase()] = chip.value;
        return acc;
      },
      {},
    );

    for (const line of lines) {
      const tf = line.match(/^Timeframe:\s*(.+)$/i);
      if (tf) {
        nextTimeframe = stripTrailingPeriod(tf[1]);
        continue;
      }

      const bd = line.match(/^Budget:\s*(.+)$/i);
      if (bd) {
        nextBudget = stripTrailingPeriod(bd[1]);
        continue;
      }

      const mt = line.match(/^Materials:\s*(.+)$/i);
      if (mt) {
        nextMaterials = stripTrailingPeriod(mt[1]);
        continue;
      }

      const ac = line.match(/^Access:\s*(.+)$/i);
      if (ac) {
        const raw = stripTrailingPeriod(ac[1]);
        const labels = raw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        nextAccessValues = labels
          .map((lbl) => labelToValue[lbl.toLowerCase()])
          .filter(Boolean);

        continue;
      }

      noteLines.push(line);
    }

    if (nextTimeframe && TIMEFRAMES.includes(nextTimeframe)) {
      setTimeframe(nextTimeframe);
    }
    if (nextBudget && BUDGETS.includes(nextBudget)) {
      setBudget(nextBudget);
    }
    if (nextMaterials && MATERIALS_OPTIONS.includes(nextMaterials)) {
      setMaterials(nextMaterials);
    }
    if (nextAccessValues.length > 0) {
      setAccess(nextAccessValues);
    }
    if (noteLines.length > 0) {
      setNotes(noteLines.join("\n"));
    }
  }, [value, ACCESS_CHIPS, timeframe, budget, materials, access.length, notes]);

  const composed = React.useMemo(() => {
    const lines: string[] = [];

    if (timeframe) lines.push(`Timeframe: ${timeframe}.`);
    if (budget) lines.push(`Budget: ${budget}.`);
    if (materials) lines.push(`Materials: ${materials}.`);

    if (access.length > 0) {
      const labelMap = ACCESS_CHIPS.reduce<Record<string, string>>(
        (acc, chip) => {
          acc[chip.value] = chip.label;
          return acc;
        },
        {},
      );

      const labels = access.map((v) => labelMap[v] || v);
      lines.push(`Access: ${labels.join(", ")}.`);
    }

    const extra = normalize(notes);
    if (extra) lines.push(extra);

    return lines.join("\n");
  }, [timeframe, budget, materials, access, notes, ACCESS_CHIPS]);

  // ✅ CRITICAL FIX:
  // Don’t overwrite an existing value with an empty composed string on initial mount.
  React.useEffect(() => {
    const current = String(value || "").trim();
    const next = String(composed || "").trim();

    // If the user hasn’t selected anything yet, keep the existing description.
    if (!next && current) return;

    // Avoid noisy parent updates
    if (next === current) return;

    onChange(composed);
  }, [composed, value, onChange]);

  return (
    <div className={className} data-testid={testId || "description-builder"}>
      <Select
        id="db-timeframe"
        label="Desired timeframe"
        placeholder="Select timeframe"
        value={timeframe || null}
        onChange={setTimeframe}
        options={TIMEFRAMES}
        data-testid="db-timeframe"
      />

      <div className="mt-3">
        <Select
          id="db-budget"
          label="Estimated budget"
          placeholder="Select a budget band"
          value={budget || null}
          onChange={setBudget}
          options={BUDGETS}
          data-testid="db-budget"
        />
      </div>

      <div className="mt-3">
        <Select
          id="db-materials"
          label="Materials"
          placeholder="Who will supply materials?"
          value={materials || null}
          onChange={setMaterials}
          options={MATERIALS_OPTIONS}
          data-testid="db-materials"
        />
      </div>

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

      <div className="mt-4">
        <label htmlFor="db-notes" className="text-xs text-slate-500">
          Extra notes (optional)
        </label>
        <textarea
          id="db-notes"
          className="input min-h-32 mt-1"
          placeholder="Anything else the tradesman should know…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="db-notes"
        />
      </div>

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
