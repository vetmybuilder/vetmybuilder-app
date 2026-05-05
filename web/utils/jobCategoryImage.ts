// web/utils/jobCategoryImage.ts
//
// Maps a project work-type string (e.g. "Roof Repair") to a category-specific
// hero image URL, used by JobCard / JobCardBack to fill the open space on the
// front of the card. The category lookup walks PROJECT_TYPES; the image map
// is keyed by category name.
//
// Images live under `web/public/job-images/{slug}.jpg`, served at
// `/job-images/{slug}.jpg`. They were hand-curated by Chris and optimised
// (1200px wide max, JPEG q80) so they land at ~100–250 KB each. Local paths
// avoid the unreliability of remote search-and-tag services that returned
// off-topic photos (e.g. a sanatorium for "bathroom" or a snow shower for
// "accessibility").

import { PROJECT_TYPES } from "@/types/projectTypes";

const FALLBACK_IMAGE = "/job-images/default.jpg";

const CATEGORY_IMAGE: Record<string, string> = {
  "Accessibility & Safety": "/job-images/accessibility-and-safety.jpg",
  Appliances: "/job-images/appliances.jpg",
  Bathroom: "/job-images/bathroom.jpg",
  Bedroom: "/job-images/bedroom.jpg",
  "Building & Construction": "/job-images/building-and-construction.jpg",
  "Carpentry & Joinery": "/job-images/carpentry-and-joinery.jpg",
  "Cleaning & Waste": "/job-images/cleaning-and-waste.jpg",
  "Damp & Waterproofing": "/job-images/damp-and-waterproofing.jpg",
  Electrical: "/job-images/electrical.jpg",
  "Energy & Renewables": "/job-images/energy-and-renewables.jpg",
  "Extensions & Conversions": "/job-images/extensions-and-conversions.jpg",
  "Exterior & Structure": "/job-images/exterior-and-structure.jpg",
  "Fencing & Gates": "/job-images/fencing-and-gates.jpg",
  Flooring: "/job-images/flooring.jpg",
  "Heating & Cooling": "/job-images/heating-and-cooling.jpg",
  Insulation: "/job-images/insulation.jpg",
  Kitchen: "/job-images/kitchen.jpg",
  "Landscaping & Garden": "/job-images/landscaping-and-garden.jpg",
  "Metalwork & Fabrication": "/job-images/metalwork-and-fabrication.jpg",
  "Painting & Decorating": "/job-images/painting-and-decorating.jpg",
  "Pest Control": "/job-images/pest-control.jpg",
  Plumbing: "/job-images/plumbing.jpg",
  "Repairs & Maintenance": "/job-images/repairs-and-maintenance.jpg",
  Roofing: "/job-images/roofing.jpg",
  "Smart Home & Security": "/job-images/smart-home-and-security.jpg",
  "Tiling & Plastering": "/job-images/tiling-and-plastering.jpg",
  "Windows & Doors": "/job-images/windows-and-doors.jpg",
};

/**
 * Returns a category-specific hero image for the given project type.
 * Walks PROJECT_TYPES to find the category whose `types` includes the
 * given workType. Case-insensitive. Falls back to a generic home-renovation
 * image when the type isn't in the catalog.
 */
export function getJobCategoryImage(workType?: string | null): string {
  if (!workType) return FALLBACK_IMAGE;
  const target = String(workType).trim().toLowerCase();
  if (!target) return FALLBACK_IMAGE;

  for (const cat of PROJECT_TYPES) {
    if (cat.types.some((t) => t.toLowerCase() === target)) {
      return CATEGORY_IMAGE[cat.category] ?? FALLBACK_IMAGE;
    }
  }
  return FALLBACK_IMAGE;
}
