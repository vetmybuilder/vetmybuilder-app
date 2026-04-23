// web/utils/serviceAreas.ts
//
// Discriminated-union model for a tradesman's selected service areas. A
// chip is either a single outward postcode (e.g. "E4") or a whole London
// borough that expands to several outward codes. Helpers enforce the
// dedup rules from the design spec:
//   - selecting a borough absorbs any individual outward chips it covers
//   - selecting an outward already covered by a selected borough is a no-op
//   - outward codes are normalised to upper-case
//   - flattened output is naturally sorted (E4 before E10)

export type ServiceArea =
  | { kind: "outward"; code: string }
  | { kind: "borough"; name: string; outwardCodes: string[] };

const OUTWARD_REGEX = /^([A-Z]{1,2})(\d+[A-Z]?)$/;

export function naturalSortOutwards(codes: string[]): string[] {
  return [...codes].sort((a, b) => {
    const ma = a.match(OUTWARD_REGEX);
    const mb = b.match(OUTWARD_REGEX);
    if (!ma || !mb) return a.localeCompare(b);
    if (ma[1] !== mb[1]) return ma[1].localeCompare(mb[1]);
    return parseInt(ma[2], 10) - parseInt(mb[2], 10);
  });
}

export function flattenServiceAreas(areas: ServiceArea[]): string[] {
  const set = new Set<string>();
  for (const a of areas) {
    if (a.kind === "outward") set.add(a.code);
    else for (const c of a.outwardCodes) set.add(c);
  }
  return naturalSortOutwards(Array.from(set));
}

function isCoveredByBorough(areas: ServiceArea[], outward: string): boolean {
  return areas.some(
    (a) => a.kind === "borough" && a.outwardCodes.includes(outward),
  );
}

export function addOutward(areas: ServiceArea[], raw: string): ServiceArea[] {
  const code = (raw || "").trim().toUpperCase();
  if (!code) return areas;
  if (areas.some((a) => a.kind === "outward" && a.code === code)) return areas;
  if (isCoveredByBorough(areas, code)) return areas;
  return [...areas, { kind: "outward", code }];
}

export function addBorough(
  areas: ServiceArea[],
  name: string,
  outwardCodes: string[],
): ServiceArea[] {
  if (areas.some((a) => a.kind === "borough" && a.name === name)) return areas;
  const covered = new Set(outwardCodes);
  const kept = areas.filter(
    (a) => !(a.kind === "outward" && covered.has(a.code)),
  );
  return [...kept, { kind: "borough", name, outwardCodes }];
}

export function removeAt(areas: ServiceArea[], index: number): ServiceArea[] {
  if (index < 0 || index >= areas.length) return areas;
  return areas.filter((_, i) => i !== index);
}
