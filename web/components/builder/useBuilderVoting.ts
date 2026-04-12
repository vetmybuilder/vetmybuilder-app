// web/components/builder/useBuilderVoting.ts

import { useState } from "react";
import { useApi } from "@/utils/api";
import type { Builder } from "@/types/builderTypes";

type Params = {
  builder: Builder | null;
  user: any;
  canVote: boolean;
  setBuilder: React.Dispatch<React.SetStateAction<Builder | null>>;
  setScore: React.Dispatch<React.SetStateAction<number | undefined>>;
  onVoted?: () => void;
};

export function useBuilderVoting({
  builder,
  user,
  canVote,
  setBuilder,
  setScore,
  onVoted,
}: Params) {
  const api = useApi();
  const [voting, setVoting] = useState(false);

  const voteUpOnce = async () => {
    if (!builder || !user || voting || builder.myLike === 1 || !canVote) return;

    setVoting(true);

    setBuilder((current) =>
      current
        ? { ...current, myLike: 1, likes: (current.likes || 0) + 1 }
        : current,
    );

    try {
      await api.post(`/api/recommendations/${builder.id}/like`);
      onVoted?.();

      const { data } = await api.get(`/api/recommendations/${builder.id}`);
      setBuilder(data.recommendation);

      try {
        const { data: ratingsData } = await api.get(
          `/api/recommendations/ratings?recommendationId=${builder.id}`,
        );

        const nextScore =
          (ratingsData &&
            typeof ratingsData.item?.score === "number" &&
            ratingsData.item.score) ??
          (Array.isArray(ratingsData?.items) &&
          typeof ratingsData.items[0]?.score === "number"
            ? ratingsData.items[0].score
            : undefined);

        if (typeof nextScore === "number") {
          setScore(nextScore);
        }
      } catch {
        // ignore score refresh failure
      }
    } catch (error: any) {
      setBuilder((current) =>
        current && current.myLike === 1
          ? {
              ...current,
              myLike: 0,
              likes: Math.max(0, (current.likes || 1) - 1),
            }
          : current,
      );

      alert(error?.response?.data?.error || "Unable to vote right now");
    } finally {
      setVoting(false);
    }
  };

  return {
    voting,
    voteUpOnce,
  };
}
