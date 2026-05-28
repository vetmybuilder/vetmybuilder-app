// web/components/tradeProfile/AreasMap.tsx
//
// "Areas covered" map. Geocodes outward postcodes (E1, E4, ...) via
// postcodes.io (free, no API key) and drops pins on a Leaflet map with
// OpenStreetMap tiles (free, no API key). Loads Leaflet from CDN so we
// don't add a build dependency.

import React, { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const PULSE_CSS = `
.vmb-pulse-wrap { position: relative; }
.vmb-pulse-dot {
  position: absolute; left: 50%; top: 50%;
  width: 12px; height: 12px; margin: -6px 0 0 -6px;
  background: var(--c); border: 2px solid #fff; border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.vmb-pulse-ring {
  position: absolute; left: 50%; top: 50%;
  width: 12px; height: 12px; margin: -6px 0 0 -6px;
  border-radius: 50%; background: var(--c);
  opacity: 0.6;
  animation: vmbPulse 2.2s ease-out infinite;
}
@keyframes vmbPulse {
  0%   { transform: scale(0.5); opacity: 0.6; }
  100% { transform: scale(5); opacity: 0; }
}
`;

function ensurePulseCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("vmb-pulse-css")) return;
  const style = document.createElement("style");
  style.id = "vmb-pulse-css";
  style.textContent = PULSE_CSS;
  document.head.appendChild(style);
}

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject();
    if (window.L) return resolve(window.L);

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.L));
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}


type AreaPoint = { code: string; lat: number; lng: number };

export default function AreasMap({ areas, points, accentHex }: { areas: string[]; points: AreaPoint[]; accentHex: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const pointsRef = useRef<Record<string, { lat: number; lng: number }>>({});
  const boundsRef = useRef<[number, number][]>([]);
  const [failed, setFailed] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  const hasPoints = Array.isArray(points) && points.length > 0;

  function resetView() {
    setActiveCode(null);
    const b = boundsRef.current;
    if (!mapInstance.current || !b.length) return;
    if (b.length === 1) mapInstance.current.flyTo(b[0], 12, { duration: 1 });
    else mapInstance.current.flyToBounds(b, { padding: [40, 40], duration: 1 });
  }

  function flyTo(code: string) {
    // Clicking the active chip again zooms back out
    if (activeCode === code) {
      resetView();
      return;
    }
    const p = pointsRef.current[code.trim().toUpperCase()];
    if (p && mapInstance.current) {
      setActiveCode(code);
      mapInstance.current.flyTo([p.lat, p.lng], 14, { duration: 1.2 });
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!hasPoints || !mapRef.current) return;

    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapRef.current) return;
        ensurePulseCss();

        if (cancelled) return;

        // Guard against re-init (React strict mode / hot reload)
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }

        const map = L.map(mapRef.current, {
          scrollWheelZoom: false,
          attributionControl: true,
        });
        mapInstance.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 18,
        }).addTo(map);

        const bounds: [number, number][] = [];
        const pointMap: Record<string, { lat: number; lng: number }> = {};
        points.forEach((p) => {
          pointMap[p.code] = { lat: p.lat, lng: p.lng };
          // Pulsing radar marker (CSS animation defined in PULSE_CSS)
          const pulseIcon = L.divIcon({
            className: "vmb-pulse-wrap",
            html: `<span class="vmb-pulse-ring" style="--c:${accentHex}"></span><span class="vmb-pulse-dot" style="--c:${accentHex}"></span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          L.marker([p.lat, p.lng], { icon: pulseIcon }).addTo(map);
          bounds.push([p.lat, p.lng]);
        });
        pointsRef.current = pointMap;
        boundsRef.current = bounds;

        if (bounds.length === 1) {
          map.setView(bounds[0], 12);
        } else {
          map.fitBounds(bounds, { padding: [40, 40] });
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [points.map((p) => p.code).join(","), accentHex]);

  const isClickable = hasPoints && !failed;
  const chips = (
    <div className="flex flex-wrap gap-2 mt-5 items-center">
      {isClickable && activeCode && (
        <button onClick={resetView} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold bg-white text-slate-900 hover:bg-slate-100 transition-colors">
          ← Show all
        </button>
      )}
      {areas.map((a) => {
        const active = activeCode === a;
        return (
          <button
            key={a}
            onClick={isClickable ? () => flyTo(a) : undefined}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
              active
                ? "text-white border-transparent"
                : "bg-white/10 border-white/15 text-white/80 hover:bg-white/20"
            } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
            style={active ? { backgroundColor: accentHex } : undefined}
          >
            <MapPinDot accentHex={active ? "#fff" : accentHex} />
            {a}
          </button>
        );
      })}
    </div>
  );

  if (!hasPoints || failed) {
    return chips;
  }

  return (
    <div>
      <div className="rounded-2xl overflow-hidden shadow-lg border border-white/10">
        <div ref={mapRef} style={{ height: "360px", width: "100%", zIndex: 0 }} />
      </div>
      {chips}
    </div>
  );
}

function MapPinDot({ accentHex }: { accentHex: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: accentHex, display: "inline-block" }} />;
}
