// web/components/BrandWatermarkScatter.tsx
//
// Decorative VetMyBuilder + VMB watermark scatter for empty page space.
// Renders absolute-positioned at low opacity behind content; pointer
// events pass through. Hidden on mobile - the cream backdrop pages we
// scatter onto are desktop-bare in their mobile flavour anyway.

export default function BrandWatermarkScatter() {
  return (
    <div
      className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden
    >
      {/* Full VetMyBuilder wordmarks - 4 anchors */}
      <Wordmark style={{ top: "40px", left: "50px", fontSize: "38px", opacity: 0.13, transform: "rotate(-8deg)" }} />
      <Wordmark style={{ top: "100px", right: "70px", fontSize: "32px", opacity: 0.12, transform: "rotate(8deg)" }} />
      <Wordmark style={{ bottom: "120px", left: "70px", fontSize: "28px", opacity: 0.12, transform: "rotate(15deg)" }} />
      <Wordmark style={{ bottom: "60px", right: "90px", fontSize: "42px", opacity: 0.13, transform: "rotate(-6deg)" }} />

      {/* VMB monograms filling the gaps */}
      <Vmb tone="amber" style={{ top: "220px", left: "30px", fontSize: "24px", opacity: 0.18, transform: "rotate(20deg)" }} />
      <Vmb style={{ top: "200px", right: "180px", fontSize: "22px", opacity: 0.16, transform: "rotate(-12deg)" }} />
      <Vmb tone="amber" style={{ top: "350px", left: "160px", fontSize: "22px", opacity: 0.18, transform: "rotate(8deg)" }} />
      <Vmb style={{ top: "400px", right: "60px", fontSize: "26px", opacity: 0.16, transform: "rotate(-18deg)" }} />
      <Vmb style={{ bottom: "260px", left: "240px", fontSize: "22px", opacity: 0.16, transform: "rotate(12deg)" }} />
      <Vmb tone="amber" style={{ bottom: "320px", right: "240px", fontSize: "24px", opacity: 0.18, transform: "rotate(-8deg)" }} />
      <Vmb style={{ top: "150px", left: "320px", fontSize: "20px", opacity: 0.16, transform: "rotate(25deg)" }} />
      <Vmb tone="amber" style={{ bottom: "180px", right: "60px", fontSize: "22px", opacity: 0.18, transform: "rotate(15deg)" }} />
    </div>
  );
}

function Wordmark({ style }: { style: React.CSSProperties }) {
  return (
    <span
      className="absolute font-black tracking-tight leading-none whitespace-nowrap"
      style={{ fontFamily: "'Sora', sans-serif", letterSpacing: "-0.02em", ...style }}
    >
      <span style={{ color: "#0f172a" }}>Vet</span>
      <span
        style={{
          fontFamily: "'Caveat', cursive",
          fontWeight: 700,
          color: "#4f46e5",
          fontSize: "115%",
        }}
      >
        My
      </span>
      <span style={{ color: "#0f172a" }}>Builder</span>
    </span>
  );
}

function Vmb({
  style,
  tone = "indigo",
}: {
  style: React.CSSProperties;
  tone?: "indigo" | "amber";
}) {
  return (
    <span
      className="absolute font-black"
      style={{
        fontFamily: "'Sora', sans-serif",
        letterSpacing: "-0.04em",
        color: tone === "amber" ? "#d97706" : "#4f46e5",
        ...style,
      }}
    >
      VMB
    </span>
  );
}
