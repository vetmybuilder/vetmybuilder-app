// web/components/ServiceAreaPicker.tsx
// Reusable service area picker with LocationField autocomplete + chip display.
import { useState } from "react";
import { MapPin } from "lucide-react";
import LocationField from "@/components/forms/LocationField";

type Props = {
  areas: string[];
  onChange: (areas: string[]) => void;
};

export default function ServiceAreaPicker({ areas, onChange }: Props) {
  const [query, setQuery] = useState("");

  function addArea(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (areas.includes(code)) return;
    onChange([...areas, code]);
  }

  function removeArea(code: string) {
    onChange(areas.filter((a) => a !== code));
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
        <MapPin className="h-3.5 w-3.5 text-zinc-400" />
        Service areas <span className="text-red-500">*</span>{" "}
        <span className="text-zinc-400 font-normal normal-case">(postcode sectors)</span>
      </label>
      <div data-testid="input-areas">
        <LocationField
          label=""
          reasonText=""
          placeholder="Type a postcode or place… e.g., E4, N17, Chingford"
          value={query}
          onChange={(val: string, meta?: any) => {
            setQuery(val || "");
            if (meta) {
              const token = meta.outward || meta.sector || meta.postcode || "";
              if (token) addArea(token);
              setQuery("");
            }
          }}
        />
      </div>
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1" data-testid="selected-areas">
          {areas.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700"
            >
              {s}
              <button
                type="button"
                onClick={() => removeArea(s)}
                className="rounded-full text-zinc-400 hover:text-zinc-700"
                aria-label={`Remove ${s}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
