// Default hero images for off-platform recommendation profiles.
// Used when the recommender didn't upload any photos. Picked deterministically
// by recommendation id so the same rec always shows the same image.
//
// All sourced from Unsplash (royalty-free under their content licence).

export const DEFAULT_BUILDER_HERO_IMAGES: readonly string[] = [
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1572297870735-d51777886aa8?w=1200&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&q=70&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1200&q=70&auto=format&fit=crop",
] as const;

export function pickDefaultBuilderHero(seed: number | string): string {
  const n = typeof seed === "number" ? seed : Number.parseInt(String(seed), 10) || 0;
  const idx = ((n % DEFAULT_BUILDER_HERO_IMAGES.length) + DEFAULT_BUILDER_HERO_IMAGES.length) % DEFAULT_BUILDER_HERO_IMAGES.length;
  return DEFAULT_BUILDER_HERO_IMAGES[idx];
}
