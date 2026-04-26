// web/components/builder/types.ts

export type Photo = {
  id: string;
  url: string;
  thumb?: string;
  alt?: string;
};

export type VerificationStatus =
  | "queued"
  | "running"
  | "verified"
  | "ambiguous"
  | "no_match"
  | "error";

export type Verification = {
  recommendationId: number;
  status: VerificationStatus;
  companyNumber?: string | null;
  companyName?: string | null;
  score?: number | null;
  sicCodes?: string[];
  checkedAt?: string;
  errorMessage?: string | null;
  googlePlaceId?: string | null;
  googleRating?: number | null;
  googleReviewsCount?: number | null;
};

export type Builder = {
  id: number;
  company: string;
  comment: string | null;
  createdAt: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  isAnonymous: 0 | 1;
  likes?: number;
  myLike?: 0 | 1;
  photos?: any;
  photoUrls?: string[];
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
  project?: { id: number; name: string };
  score?: number;
  summary?: { bullets: string[]; recommendationCount: number } | null;
  companyVerification?: Verification | null;
  reviewLinks?: Array<{ platform: string; url: string }>;
  linkedTradesmanUid?: string | null;
  isFavourite?: boolean;
};

export type CategoryRatings = {
  quality: number | null;
  reliability: number | null;
  communication: number | null;
  trust: number | null;
  value: number | null;
};

export type Review = {
  id: number;
  name: string;
  comment: string;
  createdAt?: string | null;
  ratings?: CategoryRatings | null;
  isAutoComment?: boolean;
};

export function shouldUseChName(status?: VerificationStatus) {
  return status === "verified" || status === "ambiguous";
}

export function resolveCompanyNameForBuilder(
  builder: Builder | null,
  verification: Verification | null | undefined,
) {
  const builderVerification = builder?.companyVerification;

  const picked =
    builderVerification &&
    shouldUseChName(builderVerification.status) &&
    builderVerification.companyName
      ? builderVerification
      : verification &&
          shouldUseChName(verification.status) &&
          verification.companyName
        ? verification
        : null;

  if (picked?.companyName) {
    return picked.companyName.trim().toUpperCase();
  }

  return builder?.company ?? "";
}

export function normalizePhotos(payload: Builder | null): Photo[] {
  if (!payload) return [];

  const src = payload.photos ?? payload.photoUrls ?? [];

  if (Array.isArray(src) && src.every((item) => typeof item === "string")) {
    return (src as string[]).map((url, index) => ({
      id: String(index + 1),
      url,
      thumb: url,
    }));
  }

  if (Array.isArray(src)) {
    return src
      .map((photo: any, index: number) => {
        const url = photo?.url || photo?.href || photo?.src;
        if (!url) return null;

        return {
          id: String(photo.id ?? index + 1),
          url,
          thumb: photo.thumb || photo.thumbnail || url,
          alt: photo.alt || "",
        } as Photo;
      })
      .filter(Boolean) as Photo[];
  }

  return [];
}

export function companyKey(value: string) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function recommenderLabel(recommender: {
  name: string | null;
  isAnonymous: 0 | 1;
}) {
  if (recommender.isAnonymous === 1) return "Anonymous user";

  const name = (recommender.name || "").trim();
  return name || "Guest";
}
