import * as React from "react";
import Link from "next/link";
import { useApi } from "@/utils/api";
import ProjectImageCard from "@/components/project/ProjectImageCard";

type Props = {
  id: number;
  status?: "pending" | "live" | "completed" | "archived";
  name: string;
  type?: string; // for type-based fallback
  hasGallery: boolean;
  fallbackImageUrl?: string | null;
  tradesmanPublicId?: string;
};

const GENERIC_FALLBACK =
  "https://cdn.home-designing.com/wp-content/uploads/2024/08/Graceful-Mid-Century-Modern-Living-Rooms.jpg";

const TYPE_FALLBACKS: Record<string, string> = {
  garden:
    "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?q=80&w=1200&auto=format&fit=crop",
  kitchen:
    "https://images.unsplash.com/photo-1556909114-16b3b0b28972?q=80&w=1200&auto=format&fit=crop",
  bathroom:
    "https://images.unsplash.com/photo-1617094621408-602c0f3e9f7e?q=80&w=1200&auto=format&fit=crop",
  bedroom:
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop",
  exterior:
    "https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1200&auto=format&fit=crop",
  living:
    "https://images.unsplash.com/photo-1505691723518-36a5ac3b2b8f?q=80&w=1200&auto=format&fit=crop",
};

function typeFallback(type?: string | null): string {
  if (!type) return GENERIC_FALLBACK;
  const key = String(type).toLowerCase();
  if (TYPE_FALLBACKS[key]) return TYPE_FALLBACKS[key];
  if (/garden/.test(key)) return TYPE_FALLBACKS.garden;
  if (/kitchen/.test(key)) return TYPE_FALLBACKS.kitchen;
  if (/bath/.test(key)) return TYPE_FALLBACKS.bathroom;
  if (/bed/.test(key)) return TYPE_FALLBACKS.bedroom;
  if (/exterior|outside|front|facade/.test(key)) return TYPE_FALLBACKS.exterior;
  if (/living|lounge/.test(key)) return TYPE_FALLBACKS.living;
  return GENERIC_FALLBACK;
}

export default function CompletedProjectImageCard({
  id,
  status,
  name,
  type,
  hasGallery,
  fallbackImageUrl,
  tradesmanPublicId,
}: Props) {
  const api = useApi();
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadThumb() {
      if (!hasGallery) {
        setUrl(fallbackImageUrl || typeFallback(type));
        return;
      }
      try {
        // Pull the closure photos from your endpoint; use the first as the thumb
        const { data } = await api.get<{ photos: Array<any> }>(
          `/api/projects/${id}/close/photos`
        );
        const first = data?.photos?.[0];
        const u: string | null =
          first?.fileUrl ??
          (first?.filePath ? String(first.filePath) : null) ??
          null;

        if (!cancelled) setUrl(u || fallbackImageUrl || typeFallback(type));
      } catch {
        if (!cancelled) setUrl(fallbackImageUrl || typeFallback(type));
      }
    }

    loadThumb();
    return () => {
      cancelled = true;
    };
  }, [api, id, hasGallery, fallbackImageUrl, type]);

  const href = tradesmanPublicId
    ? `/tradesman/${encodeURIComponent(tradesmanPublicId)}`
    : `/projects/${id}/completed`;

  return (
    <Link
      href={href}
      aria-label={tradesmanPublicId ? `View tradesman profile` : `Open completed gallery for ${name}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl"
      data-testid={`thumb-link-${id}`}
    >
      <ProjectImageCard
        id={id}
        status={status}
        imageUrl={url}
        type={type}
        name={name}
        data-testid={`completed-img-${id}`}
      />
    </Link>
  );
}
