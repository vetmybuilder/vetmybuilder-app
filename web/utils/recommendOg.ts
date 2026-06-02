// web/utils/recommendOg.ts
//
// Builds the per-project Open Graph title/description for the public recommend
// page, so a shared link (Facebook / Nextdoor smartlink) renders a card that
// names the actual job rather than a generic site card.

export type RecommendOg = { title: string; description: string };

export function buildRecommendOg(project: {
  name?: string;
  location?: string;
}): RecommendOg {
  const name = (project?.name || "").trim();
  const loc = (project?.location || "").trim();

  if (!name) {
    return {
      title: "Recommend a tradesperson · VetMyBuilder",
      description:
        "Know a great tradesperson? Add your recommendation on VetMyBuilder.",
    };
  }

  return {
    title: `Recommend a tradesperson · ${name}`,
    description: `Know a great tradesperson${
      loc ? ` in ${loc}` : ""
    }? Add your recommendation for "${name}" on VetMyBuilder.`,
  };
}
