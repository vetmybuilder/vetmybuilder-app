import * as React from "react";
import CompletedProjectImageCard from "./CompletedProjectImageCard";
import CompletedProjectInfoCard from "./CompletedProjectInfoCard";

type Status = "pending" | "live" | "completed" | "archived";

type Props = {
  id: number;
  name: string;
  status?: Status;
  type: string;
  location: string;

  // image hints
  coverPhotoUrl?: string | null;

  // tradesman
  tradesmanLabel: string; // "—" if unknown
  tradesmanPublicId?: string | null;

  // fallback behaviour (builders/<recId>) used when no tradesmanPublicId
  onOpenBuilder: () => void;

  // gallery flags
  hasGallery: boolean;
};

export default function CompletedProjectCard(props: Props) {
  const {
    id,
    name,
    status,
    type,
    location,
    coverPhotoUrl,
    tradesmanLabel,
    tradesmanPublicId,
    onOpenBuilder,
    hasGallery,
  } = props;

  return (
    <div className="contents" data-testid={`completed-card-${id}`}>
      <CompletedProjectImageCard
        id={id}
        status={status}
        name={name}
        hasGallery={hasGallery}
        fallbackImageUrl={coverPhotoUrl ?? undefined}
      />

      <CompletedProjectInfoCard
        id={id}
        type={type}
        location={location}
        tradesmanLabel={tradesmanLabel}
        tradesmanPublicId={tradesmanPublicId ?? null}
        onOpenBuilder={onOpenBuilder}
        hasGallery={hasGallery}
      />
    </div>
  );
}
