// web/utils/projectDescription.ts
//
// Shared parser for the structured description string emitted by the
// project-create flow:
//   "Timeframe: <v>. Budget: <v>. Materials: <v>."
// Used by the homeowner project card and the tradesman deck card to
// surface those clauses as label/value pills.
//
// Returns an empty array when the description doesn't fit the format
// (legacy free-text descriptions, or empty input). Callers should hide
// the pill row when this returns empty.

export type DescriptionPill = { label: string; value: string };

export function parseDescriptionPills(desc?: string | null): DescriptionPill[] {
  if (!desc) return [];
  const out: DescriptionPill[] = [];
  for (const part of desc.split(/\.\s*/)) {
    const m = part.match(/^\s*([^:]+):\s*(.+?)\s*$/);
    if (m) {
      out.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }
  return out;
}
