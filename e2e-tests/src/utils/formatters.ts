export const formatCreatedForUI = (
  dateLike?: string | number | Date
): string => {
  if (!dateLike) return "";
  const d =
    typeof dateLike === "string" || typeof dateLike === "number"
      ? new Date(dateLike)
      : dateLike;

  return new Date(d).toLocaleString();
};

export const titleCase = (s: string): string =>
  String(s || "").replace(
    /\w\S*/g,
    (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()
  );

export const escapeRegex = (s: string): string =>
  String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turn a slug into a loose display string (underscores -> spaces). */
export const slugToLooseDisplay = (s: string): string =>
  String(s || "")
    .replace(/_/g, " ")
    .trim();

/** Build a lenient regex: ignore case and allow spaces or hyphens between words */
export const looseEqualsRegex = (s: string): RegExp => {
  const parts = slugToLooseDisplay(s)
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex);
  const pattern = parts.join("[\\s-]*"); // matches “Semi Detached”, “Semi-Detached”, etc.
  return new RegExp(`^${pattern}$`, "i");
};
