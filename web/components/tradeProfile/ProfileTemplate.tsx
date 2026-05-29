// web/components/tradeProfile/ProfileTemplate.tsx
//
// Public tradesperson profile - renders one of 5 theme variants.
// Data comes from GET /api/t/:slug. Contact goes through VMB via the
// enquiry form (POST /api/t/:slug/enquiry) - no direct phone/email shown.

import React, { useState, useRef, useEffect } from "react";
import {
  ShieldCheck, Star, MessageCircle, MapPin, Clock, ChevronRight,
  ChevronLeft, Hammer, Award, Calendar, ArrowRight, Menu, X,
  Building2, Home, CheckCircle, Camera, ArrowDown,
} from "lucide-react";
import dynamic from "next/dynamic";

const AreasMap = dynamic(() => import("./AreasMap"), { ssr: false });

type Recommendation = { id: number; name: string; rating: number; comment: string; createdAt: string };
type Profile = {
  company_name: string;
  trade_types: string;
  service_areas: string;
  template: string;
  slug: string;
  vmb_badge: string;
  company_number: string | null;
  google_rating: number | null;
  google_reviews_count: number;
  profile_picture_url: string | null;
  member_since: string;
  photo_urls: string[];
  recommendations: Recommendation[];
  hire_count: number;
  recommendation_count: number;
  area_points: { code: string; lat: number; lng: number }[];
};

type Config = { label: string; serviceDescription: string; stockPhotos: string[] };

type Theme = {
  variant: number;
  dark: string;       // dark brand colour (hero bg, nav)
  accent: string;     // accent colour class for buttons (bg-)
  accentHover: string;
  accentText: string; // accent text colour
  accentHex: string;  // raw accent colour for map pins
  bodyBg: string;
  cardBg: string;
  star: string;
};

const THEMES: Theme[] = [
  { variant: 1, dark: "#1c1c1c", accent: "bg-amber-500", accentHover: "hover:bg-amber-400", accentText: "text-amber-500", accentHex: "#f59e0b", bodyBg: "bg-[#f8f7f4]", cardBg: "bg-white border border-slate-100", star: "text-amber-400" },
  { variant: 2, dark: "#0a1628", accent: "bg-[#e94560]", accentHover: "hover:bg-[#d63b55]", accentText: "text-[#e94560]", accentHex: "#e94560", bodyBg: "bg-white", cardBg: "bg-[#f5f7fa] border border-slate-100", star: "text-amber-400" },
  { variant: 3, dark: "#0d3320", accent: "bg-emerald-700", accentHover: "hover:bg-emerald-800", accentText: "text-emerald-700", accentHex: "#047857", bodyBg: "bg-[#fafdf8]", cardBg: "bg-white border border-emerald-100", star: "text-emerald-500" },
  { variant: 4, dark: "#2c2c2c", accent: "bg-orange-500", accentHover: "hover:bg-orange-400", accentText: "text-orange-500", accentHex: "#f97316", bodyBg: "bg-[#f2f0ed]", cardBg: "bg-white border border-slate-200", star: "text-orange-400" },
  { variant: 5, dark: "#1a1714", accent: "bg-[#c5956b]", accentHover: "hover:bg-[#b5855b]", accentText: "text-[#c5956b]", accentHex: "#c5956b", bodyBg: "bg-[#faf8f5]", cardBg: "bg-white border border-[#c5956b]/10", star: "text-[#c5956b]" },
];

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 7) return "this week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// ---- Shared sub-components ----

function Parallax({ img, overlay, children, h = "h-[480px] md:h-[580px]" }: { img: string; overlay: string; children: React.ReactNode; h?: string }) {
  return (
    <div className={`relative ${h} overflow-hidden`}>
      <div className="absolute inset-0 bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${img})` }} />
      <div className={`absolute inset-0 ${overlay}`} />
      <div className="relative h-full flex items-center">{children}</div>
    </div>
  );
}

function RoundGBadge({ profile }: { profile: Profile }) {
  if (!profile.google_rating) return null;
  const ratingWord = profile.google_rating >= 4.5 ? "Excellent" : profile.google_rating >= 4 ? "Great" : "Rated";
  return (
    <div className="absolute bottom-5 right-5 md:bottom-8 md:right-8 z-10">
      <div className="bg-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 max-w-[300px]">
        <svg viewBox="0 0 24 24" className="w-9 h-9 flex-shrink-0">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <div>
          <p className="text-[12px] font-bold text-slate-500 leading-none mb-1">{ratingWord} on Google</p>
          <div className="flex items-center gap-2">
            <span className="text-[22px] font-black text-slate-900 leading-none">{profile.google_rating}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-4 h-4 fill-current ${i < Math.round(profile.google_rating!) ? "text-amber-400" : "text-slate-200"}`} />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Based on {profile.google_reviews_count} reviews</p>
        </div>
      </div>
    </div>
  );
}

function GBadge({ profile, size = "lg" }: { profile: Profile; size?: "sm" | "lg" }) {
  if (!profile.google_rating) return null;
  const s = size === "lg";
  return (
    <div className={`inline-flex items-center gap-2.5 ${s ? "bg-white rounded-2xl shadow-lg px-5 py-3" : "bg-white/10 backdrop-blur rounded-xl px-3 py-2"}`}>
      <svg viewBox="0 0 24 24" className={s ? "w-7 h-7" : "w-5 h-5"}>
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      <div>
        <div className="flex items-center gap-1">
          <span className={`font-black ${s ? "text-[18px]" : "text-[14px] text-white"}`}>{profile.google_rating}</span>
          <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`fill-current ${s ? "w-3.5 h-3.5 text-amber-400" : "w-3 h-3 text-amber-300"}`} />)}</div>
        </div>
        <p className={s ? "text-[11px] text-slate-500" : "text-[10px] text-white/60"}>{profile.google_reviews_count} Google reviews</p>
      </div>
    </div>
  );
}

function ProjectLightbox({ photos, index, onClose, onNav, accent }: { photos: string[]; index: number; onClose: () => void; onNav: (i: number) => void; accent: string }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNav(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onNav(index + 1);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [index]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />
      <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><X className="w-5 h-5" /></button>
      {index > 0 && <button onClick={(e) => { e.stopPropagation(); onNav(index - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronLeft className="w-6 h-6" /></button>}
      {index < photos.length - 1 && <button onClick={(e) => { e.stopPropagation(); onNav(index + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronRight className="w-6 h-6" /></button>}
      <div className="relative max-w-4xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <img src={photos[index]} alt="" className="w-full rounded-2xl object-cover max-h-[75vh]" />
        <div className="flex justify-center gap-1.5 mt-4">
          {photos.map((_, i) => <button key={i} onClick={() => onNav(i)} className={`w-2 h-2 rounded-full ${i === index ? "bg-white" : "bg-white/30"}`} />)}
        </div>
      </div>
    </div>
  );
}

function ProjectGallery({ photos, accent, isStock }: { photos: string[]; accent: string; isStock: boolean }) {
  const [lb, setLb] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 380, behavior: "smooth" });
  return (
    <>
      <div className="relative group/carousel">
        <button onClick={() => scroll(-1)} className="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"><ChevronLeft className="w-6 h-6" /></button>
        <button onClick={() => scroll(1)} className="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"><ChevronRight className="w-6 h-6" /></button>
        <div ref={ref} className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-4">
          {photos.map((src, i) => (
            <div key={i} className="min-w-[300px] md:min-w-[350px] flex-shrink-0 snap-start group cursor-pointer" onClick={() => setLb(i)}>
              <div className="relative rounded-2xl overflow-hidden">
                <img src={src} alt="" className="w-full aspect-[3/2] object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"><Camera className="w-6 h-6 text-white" /></div>
                </div>
                {isStock && <span className="absolute bottom-3 left-3 bg-black/50 text-white/80 text-[10px] font-bold px-2 py-1 rounded">Sample work</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {lb !== null && <ProjectLightbox photos={photos} index={lb} onClose={() => setLb(null)} onNav={setLb} accent={accent} />}
    </>
  );
}

function Reviews({ recs, theme }: { recs: Recommendation[]; theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 360, behavior: "smooth" });
  if (!recs.length) return null;
  return (
    <div className="relative group/carousel">
      <button onClick={() => scroll(-1)} className="hidden md:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"><ChevronLeft className="w-6 h-6" /></button>
      <button onClick={() => scroll(1)} className="hidden md:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-xl items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity"><ChevronRight className="w-6 h-6" /></button>
      <div ref={ref} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2">
        {recs.map((r) => (
          <div key={r.id} className={`${theme.cardBg} rounded-2xl p-6 min-w-[300px] max-w-[340px] flex-shrink-0 snap-start`}>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">{initials(r.name)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[13px] truncate">{r.name}</p>
                <div className="flex items-center gap-1.5">
                  <div className="flex">{Array.from({ length: r.rating }).map((_, j) => <Star key={j} className={`w-3 h-3 fill-current ${theme.star}`} />)}</div>
                  <span className="text-[10px] opacity-40">{timeAgo(r.createdAt)}</span>
                </div>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed opacity-70">{`"${r.comment}"`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContactForm({ slug, theme }: { slug: string; theme: Theme }) {
  const [form, setForm] = useState({ name: "", phone: "", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit() {
    if (!form.name || !form.phone) return;
    setState("sending");
    try {
      const res = await fetch(`/api/t/${slug}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className={`${theme.cardBg} rounded-2xl p-10 text-center`}>
        <div className={`w-16 h-16 rounded-full ${theme.accent} flex items-center justify-center mx-auto mb-4`}>
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-[22px] font-black mb-2">Enquiry sent</h3>
        <p className="text-[14px] opacity-60">Thanks - your message has been sent. You'll hear back soon.</p>
      </div>
    );
  }

  return (
    <div className={`${theme.cardBg} rounded-2xl p-7 md:p-10`}>
      <h3 className="text-[24px] font-black mb-1">Get your free quote</h3>
      <p className="text-[13px] opacity-50 mb-6">Send an enquiry and they'll get back to you. No obligation.</p>
      <div className="space-y-3 max-w-lg">
        <div className="md:flex gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full md:flex-1 mb-3 md:mb-0 rounded-xl border-2 border-slate-200 px-4 py-3 text-[14px] focus:outline-none" placeholder="Your name" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full md:flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-[14px] focus:outline-none" placeholder="Phone number" />
        </div>
        <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-[14px] focus:outline-none resize-none" placeholder="Tell them about your project..." />
        {state === "error" && <p className="text-[12px] text-rose-600 font-bold">Something went wrong. Please try again.</p>}
        <button onClick={submit} disabled={state === "sending" || !form.name || !form.phone} className={`w-full ${theme.accent} ${theme.accentHover} text-white rounded-xl py-3.5 text-[14px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-50`}>
          {state === "sending" ? "Sending..." : <>Send enquiry <ArrowRight className="w-4 h-4" /></>}
        </button>
        <p className="text-[11px] text-center opacity-30">Sent securely via VetMyBuilder. We never share your details.</p>
      </div>
    </div>
  );
}

// ---- Main component ----

export default function ProfileTemplate({ profile, aboutText, photos, config }: {
  profile: Profile;
  aboutText: string;
  photos: string[];
  config: Config;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const variant = parseInt(profile.template?.split("-")[1] || "1", 10);
  const theme = THEMES[(variant - 1) % THEMES.length];

  const trades = (profile.trade_types || "").split(",").map((s) => s.trim()).filter(Boolean);
  const areas = (profile.service_areas || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isStock = !profile.photo_urls?.length;
  const heroImg = photos[0];
  const memberYear = profile.member_since ? new Date(profile.member_since).getFullYear() : new Date().getFullYear();

  const accreditations = [
    "Verified by VetMyBuilder",
    ...(profile.company_number ? ["Companies House registered"] : []),
  ];

  const stats = [
    { v: `${profile.hire_count}+`, l: "Jobs done", icon: Hammer },
    ...(profile.recommendation_count ? [{ v: String(profile.recommendation_count), l: "Recommendations", icon: Award }] : []),
    ...(profile.google_rating ? [{ v: String(profile.google_rating), l: "Google rating", icon: Star }] : []),
    { v: `Since ${memberYear}`, l: "Member", icon: Calendar },
  ];

  const tradeIcons = [Building2, Home, Hammer];

  return (
    <div className={theme.bodyBg} style={{ minHeight: "100vh", paddingBottom: "64px" }}>
      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-center px-10" style={{ backgroundColor: theme.dark }}>
          <button onClick={() => setMenuOpen(false)} className="absolute top-6 right-6 text-white"><X className="w-7 h-7" /></button>
          {["About", "Services", "Work", "Reviews", "Contact"].map((s, i) => (
            <a key={s} href={`#${s.toLowerCase()}`} onClick={() => setMenuOpen(false)} className="group flex items-center gap-4 py-3">
              <span className="text-white/20 text-[14px] font-mono">0{i + 1}</span>
              <span className="text-white text-[28px] font-black hover:opacity-70 transition-opacity">{s}</span>
            </a>
          ))}
        </div>
      )}

      {/* Nav */}
      <nav className="sticky top-0 z-[55] backdrop-blur-md" style={{ backgroundColor: `${theme.dark}f0` }}>
        <div className="max-w-5xl mx-auto px-5 md:px-8 flex items-center justify-between h-16">
          <span className="text-white text-[16px] md:text-[18px] font-black">{profile.company_name}</span>
          <div className="hidden md:flex items-center gap-6 text-[13px] font-bold text-white/60">
            {["About", "Services", "Work", "Areas", "Reviews"].map((s) => <a key={s} href={`#${s.toLowerCase()}`} className="hover:text-white transition-colors">{s}</a>)}
            <a href="#contact" className={`${theme.accent} ${theme.accentHover} text-white px-5 py-2.5 rounded-lg font-extrabold transition-colors`}>Get a quote</a>
          </div>
          <button onClick={() => setMenuOpen(true)} className="md:hidden text-white"><Menu className="w-6 h-6" /></button>
        </div>
      </nav>

      {/* Hero */}
      <Parallax img={heroImg} overlay="bg-gradient-to-r from-black/85 via-black/55 to-black/25">
        <div className="max-w-5xl mx-auto px-5 md:px-8 w-full">
          <div className="max-w-xl">
            <div className="flex flex-wrap gap-2 mb-5">
              {accreditations.map((a) => (
                <span key={a} className="bg-white/10 text-white/90 text-[10px] font-bold px-3 py-1 rounded-full border border-white/10">{a}</span>
              ))}
            </div>
            <h1 className="text-white text-[36px] md:text-[54px] font-black leading-[1.02] mb-3" style={{ fontFamily: "'Sora', sans-serif" }}>{profile.company_name}</h1>
            <p className="text-white/60 text-[16px] mb-2">{trades.slice(0, 4).join(" - ")}</p>
            {areas.length > 0 && <p className="text-white/40 text-[14px] inline-flex items-center gap-1.5 mb-6"><MapPin className="w-4 h-4" /> Covering {areas[0]} and surrounding areas</p>}
            <div className="flex flex-wrap items-center gap-4 mt-2">
              <a href="#contact" className={`${theme.accent} ${theme.accentHover} text-white px-7 py-4 rounded-xl text-[15px] font-extrabold inline-flex items-center gap-2 transition-all hover:-translate-y-0.5 shadow-lg`}>
                Get a free quote <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
        <RoundGBadge profile={profile} />
      </Parallax>

      {/* Stats */}
      <div style={{ backgroundColor: theme.dark }} className="text-white border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 flex flex-wrap justify-center md:justify-between items-stretch">
          {stats.map((s, i) => (
            <React.Fragment key={s.l}>
              {i > 0 && <div className="hidden md:block w-px self-stretch bg-white/10 mx-2" />}
              <div className="flex items-center gap-3.5 px-4 py-2 flex-1 justify-center min-w-[150px]">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0`} style={{ backgroundColor: `${theme.accentHex}22` }}>
                  <s.icon className={`w-5 h-5 ${theme.accentText}`} />
                </div>
                <div className="text-left">
                  <p className="text-[24px] font-black leading-none">{s.v}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mt-1">{s.l}</p>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* About */}
      <div id="about" className="max-w-5xl mx-auto px-5 md:px-8 py-16">
        <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>About</p>
        <h2 className="text-[28px] md:text-[36px] font-black leading-[1.1] mb-5" style={{ color: theme.dark }}>About {profile.company_name}</h2>
        <p className="text-[15px] leading-relaxed text-slate-600 max-w-3xl mb-6">{aboutText}</p>
        <div className="flex flex-wrap gap-3">
          {accreditations.map((a) => (
            <span key={a} className="inline-flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg text-[12px] font-bold text-slate-700 shadow-sm border border-slate-100">
              <Award className={`w-3.5 h-3.5 ${theme.accentText}`} /> {a}
            </span>
          ))}
        </div>
      </div>

      {/* Services */}
      <div id="services" style={{ backgroundColor: theme.dark }} className="text-white py-16">
        <div className="max-w-5xl mx-auto px-5 md:px-8">
          <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>Services</p>
          <h2 className="text-[28px] md:text-[36px] font-black mb-8">What we do</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(trades.length ? trades : [config.label]).slice(0, 6).map((t, i) => {
              const Icon = tradeIcons[i % tradeIcons.length];
              return (
                <div key={t} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                    <Icon className={`w-6 h-6 ${theme.accentText}`} />
                  </div>
                  <h3 className="text-[17px] font-bold mb-2">{t}</h3>
                  <p className="text-[13px] text-white/50 leading-relaxed">{config.serviceDescription}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Work */}
      <div id="work" className="max-w-5xl mx-auto px-5 md:px-8 py-16">
        <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>Portfolio</p>
        <h2 className="text-[28px] md:text-[36px] font-black mb-8" style={{ color: theme.dark }}>Our work</h2>
        <ProjectGallery photos={photos} accent={theme.accent} isStock={isStock} />
      </div>

      {/* Areas covered */}
      {areas.length > 0 && (
        <div id="areas" style={{ backgroundColor: theme.dark }} className="text-white py-16">
          <div className="max-w-5xl mx-auto px-5 md:px-8">
            <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>Coverage</p>
            <h2 className="text-[28px] md:text-[36px] font-black mb-2">Areas we cover</h2>
            <p className="text-white/50 text-[14px] mb-8">Serving {areas.length} postcode areas across the region.</p>
            <AreasMap areas={areas} points={profile.area_points || []} accentHex={theme.accentHex} />
          </div>
        </div>
      )}

      {/* CTA parallax */}
      <Parallax img={photos[1] || heroImg} overlay="bg-black/80" h="h-[240px]">
        <div className="max-w-5xl mx-auto px-5 md:px-8 w-full text-center text-white">
          <h2 className="text-[26px] md:text-[36px] font-black mb-4">Ready to start your project?</h2>
          <a href="#contact" className={`${theme.accent} ${theme.accentHover} text-white px-8 py-4 rounded-xl text-[15px] font-extrabold inline-flex items-center gap-2 shadow-lg`}>
            Get your free quote <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </Parallax>

      {/* Reviews */}
      {profile.recommendations.length > 0 && (
        <div id="reviews" className="max-w-5xl mx-auto px-5 md:px-8 py-16">
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 gap-4">
            <div>
              <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>Reviews</p>
              <h2 className="text-[28px] md:text-[36px] font-black" style={{ color: theme.dark }}>What clients say</h2>
            </div>
            <GBadge profile={profile} />
          </div>
          <Reviews recs={profile.recommendations} theme={theme} />
        </div>
      )}

      {/* Contact */}
      <div id="contact" className="max-w-5xl mx-auto px-5 md:px-8 py-16">
        <p className={`${theme.accentText} text-[12px] font-extrabold uppercase tracking-[0.2em] mb-3`}>Contact</p>
        <h2 className="text-[28px] md:text-[36px] font-black mb-8" style={{ color: theme.dark }}>Get in touch</h2>
        <ContactForm slug={profile.slug} theme={theme} />
      </div>

      {/* Footer */}
      <footer style={{ backgroundColor: theme.dark }} className="text-white/40 text-[12px] text-center py-6">
        <p>{profile.company_name} - verified on <span className="font-bold text-white/60">VetMyBuilder</span></p>
      </footer>

      {/* Mobile sticky CTA - enquiry only (contact via VMB) */}
      <a href="#contact" className={`md:hidden fixed bottom-0 left-0 right-0 z-50 ${theme.accent} text-white font-extrabold text-[15px] flex items-center justify-center gap-2 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.15)]`}>
        <MessageCircle className="w-5 h-5" /> Get a free quote
      </a>
    </div>
  );
}
