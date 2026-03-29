// web/pages/builders/[id].tsx
import { useState } from "react";
import { useRouter } from "next/router";
import type { GalleryImage } from "@/components/LightboxGallery";
import BuilderHeader from "@/components/builder/BuilderHeader";
import BuilderReviews from "@/components/builder/BuilderReviews";
import BuilderPhotos from "@/components/builder/BuilderPhotos";
import BuilderContactDetails from "@/components/builder/BuilderContactDetails";
import { useBuilderProfile } from "@/components/builder/useBuilderProfile";
import { resolveCompanyNameForBuilder } from "@/types/builderTypes";
import { useBuilderVoting } from "@/components/builder/useBuilderVoting";

export default function BuilderProfilePage() {
  const router = useRouter();
  const { id } = router.query;

  const {
    builder,
    setBuilder,
    loading,
    err,
    verification,
    score,
    setScore,
    scoreErr,
    aggPhones,
    aggPhotos,
    aggReviews,
    aggUpdatedAt,
    friendCount,
    isOwner,
    canVote,
    redirecting,
    user,
  } = useBuilderProfile(id);

  const { voting, voteUpOnce } = useBuilderVoting({
    builder,
    user,
    canVote,
    setBuilder,
    setScore,
  });

  if (redirecting) return null;

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
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          Loading…
        </div>
      ) : err ? (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 shadow-sm"
          data-testid="builder-error"
        >
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
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
            <div className="space-y-6">
              <BuilderReviews reviews={aggReviews} />
              <BuilderPhotos
                user={user}
                galleryImages={galleryImages}
                photos={aggPhotos}
              />
            </div>

            <div className="space-y-6">
              <BuilderContactDetails user={user} phones={aggPhones} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
