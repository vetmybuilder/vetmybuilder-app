export const TRADE_FAMILIES: Record<
  string,
  {
    label: string;
    aboutTemplates: string[];
    serviceDescription: string;
    stockPhotos: string[];
  }
> = {
  bathroom: {
    label: "Bathroom",
    aboutTemplates: [
      "{company} is a verified bathroom specialist serving {areas}. With {experience} years of experience, they deliver stunning bathroom transformations from design through to completion. Every project is handled with meticulous attention to detail and quality materials.",
      "{company} specialises in complete bathroom renovations across {areas}. From modern wet rooms to traditional suites, they bring expert craftsmanship and transparent pricing to every project.",
    ],
    serviceDescription: "Complete bathroom design, supply, and installation. Tiling, plumbing, electrics, and finishing all handled in-house.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1620626011761-996317b8d101?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=900&h=600&fit=crop",
    ],
  },
  kitchen: {
    label: "Kitchen",
    aboutTemplates: [
      "{company} is a verified kitchen specialist serving {areas}. They design and build beautiful, functional kitchens tailored to your home and lifestyle. From contemporary handleless designs to classic shaker styles.",
      "{company} delivers expert kitchen installations across {areas}. With {experience} years of experience, they handle everything from design to fitting, worktops to tiling.",
    ],
    serviceDescription: "Kitchen design, removal, installation, worktops, tiling, plumbing, and electrics.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?w=900&h=600&fit=crop",
    ],
  },
  extension: {
    label: "Extensions & Building",
    aboutTemplates: [
      "{company} is a verified building and renovation specialist serving {areas}. With {experience} years of expertise in extensions, loft conversions, and general building work, they deliver quality craftsmanship backed by community recommendations.",
      "{company} has been delivering outstanding building projects across {areas} for {experience} years. From single-storey extensions to complete renovations, every job is completed to the highest standard.",
    ],
    serviceDescription: "Single and double-storey extensions, side returns, wrap-arounds, loft conversions, and structural alterations.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1523413363574-c30aa1c2a516?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1597218868981-1b68e15f0065?w=900&h=600&fit=crop",
    ],
  },
  roofing: {
    label: "Roofing",
    aboutTemplates: [
      "{company} is a verified roofing specialist serving {areas}. They handle all types of roofing work from repairs and replacements to new builds. Fully insured with quality guaranteed.",
    ],
    serviceDescription: "Flat and pitched roofing, repairs, replacements, leadwork, fascias, soffits, and guttering.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1632759248573-ce5e0d2c7b52?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  electrical: {
    label: "Electrical",
    aboutTemplates: [
      "{company} is a verified electrician serving {areas}. From rewires to consumer unit upgrades, they deliver safe, certified electrical work to the highest standard.",
    ],
    serviceDescription: "Full rewires, consumer units, lighting design, sockets, EV chargers, and testing/certification.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  plumbing: {
    label: "Plumbing & Heating",
    aboutTemplates: [
      "{company} is a verified plumbing and heating specialist serving {areas}. From boiler installations to bathroom plumbing, they provide reliable, certified work with transparent pricing.",
    ],
    serviceDescription: "Boiler installation and servicing, central heating, bathroom plumbing, leaks, and gas safety.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  painting: {
    label: "Painting & Decorating",
    aboutTemplates: [
      "{company} is a verified painter and decorator serving {areas}. They deliver flawless finishes on interior and exterior work, from full house redecorations to feature walls.",
    ],
    serviceDescription: "Interior and exterior painting, wallpapering, spray finishing, and surface preparation.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1562259929-b4e1fd3aef09?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  landscaping: {
    label: "Landscaping & Garden",
    aboutTemplates: [
      "{company} is a verified landscaping specialist serving {areas}. From garden design to driveways and fencing, they transform outdoor spaces with quality workmanship.",
    ],
    serviceDescription: "Garden design, patios, decking, driveways, fencing, turfing, and planting.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  windows: {
    label: "Windows & Doors",
    aboutTemplates: [
      "{company} is a verified window and door specialist serving {areas}. They supply and fit all types of windows and doors including uPVC, aluminium, and timber.",
    ],
    serviceDescription: "Window and door supply, fitting, replacement, secondary glazing, and repairs.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&h=600&fit=crop",
    ],
  },
  insulation: {
    label: "Insulation & Energy",
    aboutTemplates: [
      "{company} is a verified insulation specialist serving {areas}. They help homeowners reduce energy bills with cavity wall, loft, and external wall insulation funded by government grants.",
    ],
    serviceDescription: "Cavity wall insulation, loft insulation, external wall insulation, and EPC upgrades.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1597218868981-1b68e15f0065?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
  general: {
    label: "General",
    aboutTemplates: [
      "{company} is a verified tradesperson serving {areas}. They deliver quality workmanship with transparent pricing and excellent communication throughout every project.",
    ],
    serviceDescription: "Professional trade services delivered with quality materials and expert craftsmanship.",
    stockPhotos: [
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1523413363574-c30aa1c2a516?w=900&h=600&fit=crop",
      "https://images.unsplash.com/photo-1534237710431-e2fc698436d0?w=900&h=600&fit=crop",
    ],
  },
};

export function getTradeFamily(templateKey: string): string {
  return templateKey?.split("-")[0] || "general";
}

export function getTemplateVariant(templateKey: string): number {
  return parseInt(templateKey?.split("-")[1] || "1", 10);
}

export function generateAboutText(
  templateKey: string,
  companyName: string,
  areas: string,
  experienceYears?: number,
): string {
  const family = getTradeFamily(templateKey);
  const config = TRADE_FAMILIES[family] || TRADE_FAMILIES.general;
  const templates = config.aboutTemplates;
  const variant = getTemplateVariant(templateKey);
  const template = templates[(variant - 1) % templates.length];
  return template
    .replace(/{company}/g, companyName)
    .replace(/{areas}/g, areas || "your area")
    .replace(/{experience}/g, String(experienceYears || 10));
}
