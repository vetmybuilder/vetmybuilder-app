// web/components/PilotAreasBanner.tsx
//
// Slim info banner shown above the LocationField in the new-job wizard.
// Explains which boroughs the pilot currently covers so a homeowner who
// types a postcode outside the supported areas understands why the field
// is rejecting their selection.
//
// Reads /api/pilot/areas on mount. While loading or if the fetch fails
// the banner stays hidden - the field's own pilot-block message is the
// authoritative copy.

import { useEffect, useState } from "react";

export default function PilotAreasBanner() {
  const [boroughs, setBoroughs] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/pilot/areas");
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        const names = Array.isArray(data?.boroughs)
          ? data.boroughs.map((b: { name: string }) => b.name)
          : [];
        setBoroughs(names);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!boroughs || boroughs.length === 0) return null;

  const formatted =
    boroughs.length === 1
      ? boroughs[0]
      : boroughs.length === 2
        ? `${boroughs[0]} and ${boroughs[1]}`
        : `${boroughs.slice(0, -1).join(", ")} and ${boroughs[boroughs.length - 1]}`;

  return (
    <div
      className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5"
      data-testid="pilot-areas-banner"
    >
      <p className="text-[12.5px] font-bold text-indigo-900 leading-snug">
        We&apos;re piloting in {formatted}.
      </p>
      <p className="mt-0.5 text-[11.5px] text-indigo-800/80 leading-snug">
        We&apos;ll be opening up more areas soon.
      </p>
    </div>
  );
}
