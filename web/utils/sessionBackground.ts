// web/utils/sessionBackground.ts
//
// Picks a single background image per browser session and shares it
// across consumers (Layout, MobileMenu, etc) so the user sees a
// consistent hero photo behind every full-bleed surface.
//
// Pulled out of Layout.tsx so the menu portal (which lives outside the
// Layout tree) shows the same image without each consumer rolling its
// own random pick.

const BG_IMAGES = [
  "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=1920&q=80&auto=format",
  "https://images.unsplash.com/photo-1716037991590-c975184b37df?w=1920&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1646324554833-f0b6a479fa5d?w=1920&q=80&auto=format&fit=crop",
];

let sessionBg: string | null = null;

export function getSessionBg(): string {
  if (!sessionBg) {
    sessionBg = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)]!;
  }
  return sessionBg;
}
