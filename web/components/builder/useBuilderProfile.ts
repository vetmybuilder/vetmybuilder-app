// web/components/builder/useBuilderProfile.ts

import { useEffect, useMemo, useState } from "react";
import { useApi } from "@/utils/api";
import { useAuth } from "@/utils/auth";
import { Builder, Verification } from "@/types/builderTypes";
import { getWithAuthRetry } from "./api";
import { getAggregateVmbForCompany, type FetchRecsFn } from "@/utils/vmb";
import { useBuilderAggregates } from "./useBuilderAggregates";
import { useTradesmanRedirect } from "./useTradesmanRedirect";

export function useBuilderProfile(id: string | string[] | undefined) {
  const api = useApi();
  const { user, loading: authLoading } = useAuth();

  const { redirecting } = useTradesmanRedirect({
    api,
    user,
    authLoading,
  });

  const [builder, setBuilder] = useState<Builder | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [verification, setVerification] = useState<Verification | null>(null);
  const [score, setScore] = useState<number | undefined>(undefined);
  const [scoreErr, setScoreErr] = useState<string | null>(null);

  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);

  const {
    aggPhones,
    aggEmails,
    aggNames,
    aggPhotos,
    aggUpdatedAt,
    aggReviews,
    friendCount,
  } = useBuilderAggregates({
    api,
    builder,
    redirecting,
  });

  const isOwner = useMemo(
    () =>
      !!(user && projectOwnerId && String(user.uid) === String(projectOwnerId)),
    [user, projectOwnerId],
  );

  const canVote = !!user;

  useEffect(() => {
    if (authLoading || !id || redirecting) return;

    if (!user) {
      setLoading(false);
      setErr(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}`),
        );

        if (!alive) return;

        setBuilder(data.recommendation);
        setScore(
          typeof data?.recommendation?.score === "number"
            ? data.recommendation.score
            : undefined,
        );
      } catch (e: any) {
        if (!alive) return;

        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error || e?.response?.data?.error || e?.message || "";

        if (status === 401 || /bearer token/i.test(String(msg))) {
          setErr(null);
        } else {
          setErr("Failed to load builder");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, authLoading, user, redirecting]);

  useEffect(() => {
    const projectId = builder?.project?.id;
    if (!projectId || !user || redirecting) return;

    let alive = true;

    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${projectId}`);
        if (!alive) return;
        setProjectOwnerId(data?.project?.ownerUserId ?? null);
      } catch {
        if (!alive) return;
        setProjectOwnerId(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, builder?.project?.id, user, redirecting]);

  useEffect(() => {
    if (authLoading || !user || !id || redirecting) return;

    let alive = true;

    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/${id}/verification`),
        );

        if (!alive) return;
        setVerification(data?.verification || null);
      } catch {
        if (!alive) return;
        setVerification(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, authLoading, user, redirecting]);

  useEffect(() => {
    if (authLoading || !user || !id || redirecting) return;

    let alive = true;
    setScoreErr(null);

    (async () => {
      try {
        const { data } = await getWithAuthRetry(() =>
          api.get(`/api/recommendations/ratings?recommendationId=${id}`),
        );

        if (!alive) return;

        const v =
          (data && typeof data.item?.score === "number" && data.item.score) ??
          (Array.isArray(data?.items) &&
          typeof data.items[0]?.score === "number"
            ? data.items[0].score
            : undefined);

        if (typeof v === "number") setScore(v);
      } catch {
        if (!alive) return;
        setScoreErr("Could not load score");
      }
    })();

    return () => {
      alive = false;
    };
  }, [api, id, authLoading, user, redirecting]);

  useEffect(() => {
    const projectId = builder?.project?.id;
    const companyName = builder?.company || "";

    if (!projectId || !companyName || redirecting) return;

    let cancelled = false;

    (async () => {
      try {
        const ratingsFetcher: FetchRecsFn = async ({
          projectId,
          offset = 0,
          limit = 250,
        }) => {
          const { data } = await api.get(
            `/api/recommendations/ratings?projectId=${projectId}&offset=${offset}&limit=${limit}`,
          );

          const items =
            (data?.items || []).map((it: any) => ({
              id: it.id,
              company: it.company,
              score: it.score,
            })) ?? [];

          const total = Number.isFinite(data?.total)
            ? data.total
            : items.length;

          return { items, total };
        };

        const singleScore =
          typeof score === "number"
            ? score
            : typeof builder?.score === "number"
              ? builder.score
              : undefined;

        const agg = await getAggregateVmbForCompany(
          ratingsFetcher,
          projectId,
          companyName,
          singleScore,
        );

        if (!cancelled && typeof agg === "number") setScore(agg);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [api, builder?.project?.id, builder?.company, score, redirecting]);

  return {
    builder,
    setBuilder,
    loading: authLoading || loading,
    err,
    verification,
    score,
    setScore,
    scoreErr,
    aggPhones,
    aggEmails,
    aggNames,
    aggPhotos,
    aggReviews,
    aggUpdatedAt,
    friendCount,
    isOwner,
    canVote,
    redirecting,
    user,
    authLoading,
  };
}
