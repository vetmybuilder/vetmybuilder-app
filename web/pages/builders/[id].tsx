// web/pages/builders/[id].tsx
import { useState } from "react";
import Toast from "@/components/Toast";
import ReportModal from "@/components/ReportModal";
import { useRouter } from "next/router";
import type { GalleryImage } from "@/components/LightboxGallery";
import Layout from "@/components/Layout";
import BuilderHeader from "@/components/builder/BuilderHeader";
import BuilderReviews from "@/components/builder/BuilderReviews";
import BuilderPhotos from "@/components/builder/BuilderPhotos";
import BuilderContactDetails from "@/components/builder/BuilderContactDetails";
import BuilderProfileMobile from "@/components/builder/BuilderProfileMobile";
import { useApi } from "@/utils/api";
import { useBuilderProfile } from "@/components/builder/useBuilderProfile";
import { resolveCompanyNameForBuilder } from "@/types/builderTypes";
import { useBuilderVoting } from "@/components/builder/useBuilderVoting";
import NotFound from "@/pages/404";

export default function BuilderProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const {
    builder,
    setBuilder,
    loading,
    err,
    notFound,
    verification,
    score,
    setScore,
    scoreErr,
    aggPhones,
    aggEmails,
    aggPhotos,
    aggReviews,
    aggUpdatedAt,
    friendCount,
    isOwner,
    canVote,
    redirecting,
    user,
  } = useBuilderProfile(id);

  const [toast, setToast] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const api = useApi();

  const { voting, voteUpOnce } = useBuilderVoting({
    builder,
    user,
    canVote,
    setBuilder,
    setScore,
    onVoted: () => setToast("Endorsement recorded"),
  });

  // Favourite toggle: hits the existing /api/tradesmen/:uid/favourite
  // endpoint using the recommendation's linked_tradesman_uid. The
  // recommendation itself isn't favouriteable, so the heart only renders
  // when there's a linked tradesman to favourite against.
  async function toggleFavourite() {
    if (!builder || favBusy) return;
    const uid = builder.linkedTradesmanUid;
    if (!uid) return;
    const currentlyFav = !!builder.isFavourite;
    setFavBusy(true);
    try {
      if (currentlyFav) {
        await api.delete(`/api/tradesmen/${encodeURIComponent(uid)}/favourite`);
        setBuilder({ ...builder, isFavourite: false });
        setToast("Removed from favourites");
      } else {
        await api.post(`/api/tradesmen/${encodeURIComponent(uid)}/favourite`);
        setBuilder({ ...builder, isFavourite: true });
        setToast("Saved to favourites");
      }
    } catch (e) {
      setToast("Couldn't update favourites");
    } finally {
      setFavBusy(false);
    }
  }

  if (redirecting) return null;

  // Guests → 404 (builder profiles require auth)
  if (!loading && !user) return <NotFound />;

  // Builder doesn't exist → render the standard 404 page
  if (notFound) return <NotFound />;

  const companyName = user
    ? resolveCompanyNameForBuilder(builder, verification)
    : "Create a free account to view company details";

  const updatedDisplay =
    aggUpdatedAt ||
    builder?.createdAt ||
    (builder ? new Date().toISOString() : null);

  const avatarInitials = companyName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const galleryImages: GalleryImage[] = aggPhotos.map((photo, index) => ({
    id: photo.id ?? String(index + 1),
    thumbUrl: photo.thumb || photo.url,
    fullUrl: photo.url,
    alt: photo.alt,
  }));

  const avatarUrl = galleryImages[0]?.thumbUrl ?? galleryImages[0]?.fullUrl;

  return (
    <>
      {/* MOBILE — bare V1 hero portrait redesign */}
      <div className="md:hidden">
        {!loading && builder && user && (
          <BuilderProfileMobile
            builder={builder}
            companyName={companyName}
            verification={verification}
            user={user}
            score={score ?? null}
            friendCount={friendCount}
            photos={aggPhotos}
            reviews={aggReviews}
            phones={aggPhones}
            emails={aggEmails}
            isOwner={isOwner}
            canVote={canVote}
            voting={voting}
            onVote={voteUpOnce}
            isFavourite={!!builder.isFavourite}
            favBusy={favBusy}
            onToggleFavourite={toggleFavourite}
          />
        )}
        {loading && (
          <Layout>
            <div className="px-5 py-8 text-sm text-gray-500">Loading…</div>
          </Layout>
        )}
        {err && !loading && (
          <Layout>
            <div className="px-5 py-8 text-sm text-red-600" data-testid="builder-error-mobile">
              {err}
            </div>
          </Layout>
        )}
      </div>

      {/* DESKTOP — unchanged: existing layout with site chrome */}
      <div className="hidden md:block">
      <Layout>
      <div className="relative min-h-screen overflow-x-hidden -mt-14">

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-16">
          {loading ? (
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 text-sm text-zinc-500">
              Loading…
            </div>
          ) : err ? (
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 text-sm text-red-600" data-testid="builder-error">
              {err}
            </div>
          ) : builder ? (
            <div className="space-y-6">
              <BuilderHeader
                builder={builder}
                verification={verification}
                user={user}
                score={score}
                scoreErr={scoreErr}
                friendCount={friendCount}
                isOwner={isOwner}
                canVote={canVote}
                voting={voting}
                onVote={voteUpOnce}
                avatarUrl={avatarUrl}
                avatarInitials={avatarInitials}
                updatedDisplay={updatedDisplay}
                reviewCount={aggReviews.length}
                photoCount={aggPhotos.length}
              />

              {/* Builder AI summary */}
              {builder?.summary && (
                <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 px-6 py-5">
                  <h2 className="text-lg font-bold text-zinc-900 mb-3">
                    What the community says
                  </h2>
                  <ul className="space-y-2">
                    {builder.summary.bullets.map((bullet: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                        <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-zinc-400">
                    Based on {builder.summary.recommendationCount} recommendations
                    <span className="mx-1.5">&middot;</span>
                    AI-generated
                  </p>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
                <div className="space-y-6">
                  <BuilderReviews reviews={aggReviews} />
                  <BuilderPhotos user={user} galleryImages={galleryImages} photos={aggPhotos} />
                </div>
                <div className="space-y-6">
                  <BuilderContactDetails user={user} phones={aggPhones} emails={aggEmails} onReport={() => setShowReport(true)} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </Layout>
      </div>

      {showReport && builder?.id && (
        <ReportModal
          targetType="profile"
          targetId={builder.id}
          onClose={() => setShowReport(false)}
        />
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
