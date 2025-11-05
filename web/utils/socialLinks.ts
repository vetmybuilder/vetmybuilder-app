// web/utils/socialLinks.ts
export const normHandle = (v: string) => (v || "").trim().replace(/^@/, "");

export function normalizeAsUrl(raw: string): string | null {
  let v = (raw || "").trim();
  if (!v || v.startsWith("@")) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const normalizeInstagram = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://instagram.com/${encodeURIComponent(h)}` : null;
};
export const normalizeTikTok = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://www.tiktok.com/@${encodeURIComponent(h)}` : null;
};
export const normalizeX = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://x.com/${encodeURIComponent(h)}` : null;
};
export const normalizeFacebook = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://facebook.com/${encodeURIComponent(h)}` : null;
};
export const normalizeYouTube = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://www.youtube.com/@${encodeURIComponent(h)}` : null;
};
export const normalizeLinkedIn = (raw: string) => {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).toString();
    } catch {
      return null;
    }
  }
  const h = normHandle(raw);
  return h ? `https://www.linkedin.com/company/${encodeURIComponent(h)}` : null;
};
