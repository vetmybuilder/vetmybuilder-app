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
    <>
      <style>{`body { background: #fafaf9 !important; }`}</style>
      <div className="relative min-h-screen overflow-x-hidden bg-stone-50 -mt-14">
        {/* Background bands */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
          <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-24 pb-16">
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

              <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
                <div className="space-y-6">
                  <BuilderReviews reviews={aggReviews} />
                  <BuilderPhotos user={user} galleryImages={galleryImages} photos={aggPhotos} />
                </div>
                <div className="space-y-6">
                  <BuilderContactDetails user={user} phones={aggPhones} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
