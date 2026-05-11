// web/components/BrandWatermarkScatter.tsx
//
// Decorative VetMyBuilder + VMB watermark scatter for empty page space.
// Renders absolute-positioned at low opacity behind content; pointer
// events pass through. Hidden on mobile - the cream backdrop pages we
// scatter onto are desktop-bare in their mobile flavour anyway.

// Vertical positions are expressed as `top: <percent>` so the scatter
// fills the FULL parent height. Previously every item used a fixed
// pixel offset, which meant tall content sections (legal pages, FAQs)
// had watermarks clustered at the top and bottom only with a big empty
// middle. Percentages spread the items proportionally regardless of how
// tall the parent grows.
export default function BrandWatermarkScatter() {
  return (
    <div
      className="hidden md:block absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden
    >
      {/* Full VetMyBuilder wordmarks - 4 anchors spread top → bottom */}
      <Wordmark style={{ top: "4%", left: "50px", fontSize: "38px", opacity: 0.13, transform: "rotate(-8deg)" }} />
      <Wordmark style={{ top: "28%", right: "70px", fontSize: "32px", opacity: 0.12, transform: "rotate(8deg)" }} />
      <Wordmark style={{ top: "62%", left: "70px", fontSize: "28px", opacity: 0.12, transform: "rotate(15deg)" }} />
      <Wordmark style={{ top: "88%", right: "90px", fontSize: "42px", opacity: 0.13, transform: "rotate(-6deg)" }} />

      {/* VMB monograms filling the gaps between the wordmarks */}
      <Vmb tone="amber" style={{ top: "12%", left: "30px", fontSize: "24px", opacity: 0.18, transform: "rotate(20deg)" }} />
      <Vmb style={{ top: "18%", right: "180px", fontSize: "22px", opacity: 0.16, transform: "rotate(-12deg)" }} />
      <Vmb tone="amber" style={{ top: "36%", left: "160px", fontSize: "22px", opacity: 0.18, transform: "rotate(8deg)" }} />
      <Vmb style={{ top: "44%", right: "60px", fontSize: "26px", opacity: 0.16, transform: "rotate(-18deg)" }} />
      <Vmb style={{ top: "56%", left: "240px", fontSize: "22px", opacity: 0.16, transform: "rotate(12deg)" }} />
      <Vmb tone="amber" style={{ top: "72%", right: "240px", fontSize: "24px", opacity: 0.18, transform: "rotate(-8deg)" }} />
      <Vmb style={{ top: "20%", left: "320px", fontSize: "20px", opacity: 0.16, transform: "rotate(25deg)" }} />
      <Vmb tone="amber" style={{ top: "80%", right: "60px", fontSize: "22px", opacity: 0.18, transform: "rotate(15deg)" }} />
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
