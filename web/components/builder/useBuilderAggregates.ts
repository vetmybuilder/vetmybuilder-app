// web/components/builder/useBuilderAggregates.ts

import { useEffect, useState } from "react";
import type { Builder, Photo, Review, CategoryRatings } from "@/types/builderTypes";
import {
  normalizePhotos,
  companyKey,
  recommenderLabel,
} from "@/types/builderTypes";
import { fetchProjectRecommendations } from "./api";
import {
  hasAnyRating,
  deterministicSummary,
} from "@/utils/ratingSummary";

function normalizeRatings(raw: any): CategoryRatings | null {
  if (!raw || typeof raw !== "object") return null;
  const pick = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  };
  const ratings: CategoryRatings = {
    quality: pick(raw.quality),
    reliability: pick(raw.reliability),
    communication: pick(raw.communication),
    trust: pick(raw.trust),
    value: pick(raw.value),
  };
  return hasAnyRating(ratings) ? ratings : null;
}

type Params = {
  api: any;
  builder: Builder | null;
  redirecting: boolean;
};

type Result = {
  aggPhones: string[];
  aggEmails: string[];
  aggNames: string[];
  aggPhotos: Photo[];
  aggUpdatedAt: string | null;
  aggReviews: Review[];
  friendCount: number;
};

export function useBuilderAggregates({
  api,
  builder,
  redirecting,
}: Params): Result {
  const [aggPhones, setAggPhones] = useState<string[]>([]);
  const [aggEmails, setAggEmails] = useState<string[]>([]);
  const [aggNames, setAggNames] = useState<string[]>([]);
  const [aggPhotos, setAggPhotos] = useState<Photo[]>([]);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<string | null>(null);
  const [aggReviews, setAggReviews] = useState<Review[]>([]);
  const [friendCount, setFriendCount] = useState<number>(0);

  useEffect(() => {
    if (!builder || redirecting) return;

    (async () => {
      const pid = builder?.project?.id;
      const baseCompany = builder?.company || "";

      if (!pid || !baseCompany) {
        const singlePhones: string[] = [];
        const singleEmails: string[] = [];

        const phone = String(builder.phone || "").trim();
        if (phone && phone.length >= 7) singlePhones.push(phone);

        const email = String(builder.email || "").trim();
        if (email && email.includes("@")) singleEmails.push(email);

        setAggPhones(singlePhones);
        setAggEmails(singleEmails);
        setAggNames([recommenderLabel(builder)]);
        setAggPhotos(normalizePhotos(builder));
        setAggUpdatedAt(builder?.createdAt || null);
        setFriendCount(builder.fromFriend === 1 ? 1 : 0);
        const fallbackRatings = normalizeRatings((builder as any).ratings);
        const fallbackComment = String(builder.comment || "").trim();
        const fallbackAuto = !fallbackComment
          ? deterministicSummary(fallbackRatings)
          : null;
        const fallbackText = fallbackComment || fallbackAuto || "";

        setAggReviews(
          fallbackText || fallbackRatings
            ? [
                {
                  id: builder.id,
                  name: recommenderLabel(builder),
                  comment: fallbackText,
                  createdAt: builder.createdAt,
                  ratings: fallbackRatings,
                  isAutoComment: !fallbackComment && Boolean(fallbackAuto),
                },
              ]
            : [],
        );
        return;
      }

      const allRecs = await fetchProjectRecommendations(api, pid);
      const key = companyKey(baseCompany);

      const byId = new Map<number, any>();
      const source = [builder, ...allRecs].filter(Boolean);

      for (const rec of source) {
        if (!rec || typeof rec.id !== "number") continue;
        if (companyKey(rec.company || "") !== key) continue;
        if (!byId.has(rec.id)) byId.set(rec.id, rec);
      }

      let group = Array.from(byId.values());
      if (group.length === 0) group = [builder];

      const hydratedRaw = await Promise.all(
        group.map(async (rec) => {
          if (!rec || typeof rec.id !== "number") return null;

          try {
            const { data } = await api.get(`/api/recommendations/${rec.id}`);
            return data?.recommendation || rec;
          } catch {
            return rec;
          }
        }),
      );

      const full = hydratedRaw.filter(Boolean) as any[];

      const phones: string[] = full
        .map((rec) => String(rec.phone || "").trim())
        .filter((phone) => phone && phone.length >= 7);

      const emails: string[] = full
        .map((rec) => String(rec.email || "").trim())
        .filter((email) => email && email.includes("@"));

      const names = Array.from(
        new Set(full.map((rec) => recommenderLabel(rec))),
      );

      const latestMs = Math.max(
        ...full
          .map((rec) => +new Date(rec.createdAt))
          .filter((n) => Number.isFinite(n)),
      );

      const latestIso = Number.isFinite(latestMs)
        ? new Date(latestMs).toISOString()
        : builder.createdAt;

      const friendCountVal = full.filter(
        (rec: any) => rec.fromFriend === 1,
      ).length;

      const seenUrls = new Set<string>();
      const sharedOnly: Photo[] = full.flatMap((rec: any) =>
        normalizePhotos(rec)
          .filter((photo: any) => {
            if (!photo.url || seenUrls.has(photo.url)) return false;
            seenUrls.add(photo.url);
            return true;
          })
          .map((photo: any) => ({
            ...photo,
            alt:
              photo.alt && photo.alt.trim()
                ? photo.alt
                : `${rec.company || builder.company} — shared photo`,
          })),
      );

      const reviews: Review[] = full
        .map((rec: any) => {
          const ratings = normalizeRatings(rec?.ratings);
          const comment = String(rec.comment || "").trim();
          const auto = !comment ? deterministicSummary(ratings) : null;
          const text = comment || auto || "";
          if (!text && !ratings) return null;
          return {
            id: rec.id,
            name: recommenderLabel(rec),
            comment: text,
            createdAt: rec.createdAt,
            ratings,
            isAutoComment: !comment && Boolean(auto),
          } as Review;
        })
        .filter((r): r is Review => r !== null);

      reviews.sort((a, b) => {
        const aTime = a.createdAt ? +new Date(a.createdAt) : 0;
        const bTime = b.createdAt ? +new Date(b.createdAt) : 0;
        return bTime - aTime;
      });

      setAggPhones(phones);
      setAggEmails(emails);
      setAggNames(names);
      setAggPhotos(sharedOnly);
      setAggUpdatedAt(latestIso || builder.createdAt || null);
      setFriendCount(friendCountVal);
      setAggReviews(reviews);
    })();
  }, [api, builder, redirecting]);

  return {
    aggPhones,
    aggEmails,
    aggNames,
    aggPhotos,
    aggUpdatedAt,
    aggReviews,
    friendCount,
  };
}
