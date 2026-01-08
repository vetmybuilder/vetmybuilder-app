// web/utils/shareInvite.ts

export type ShareChannel = "whatsapp" | "sms" | "email";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Build the default invite message including the generated invite URL.
 */
export function buildDefaultInviteMessage(opts: {
  projectName?: string;
  location?: string;
  inviteUrl: string;
}): string {
  const { projectName, location, inviteUrl } = opts;

  const projectBit = projectName
    ? `about my project "${projectName}"`
    : "about some work on my home";
  const locationBit = location ? ` in ${location}` : "";

  return [
    `Hi! I’m using VetMyBuilder to find trusted tradespeople ${projectBit}${locationBit}.`,
    "",
    "Do you know anyone you’d recommend?",
    "",
    inviteUrl,
  ].join("\n");
}

/** Open WhatsApp or WhatsApp Web with a prefilled message */
export function openWhatsAppShare(message: string) {
  if (typeof window === "undefined") return;
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Open SMS / iMessage composer */
export function openSmsShare(message: string) {
  if (typeof window === "undefined") return;
  const encoded = encodeURIComponent(message);

  // iOS treats body with `&body=`, others with `?body=`
  const base = isIOS() ? "sms:&body=" : "sms:?body=";
  const url = `${base}${encoded}`;
  window.location.href = url;
}

/** Open default email client with subject + body */
export function openEmailShare(subject: string, body: string) {
  if (typeof window === "undefined") return;
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  const url = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
  window.location.href = url;
}
