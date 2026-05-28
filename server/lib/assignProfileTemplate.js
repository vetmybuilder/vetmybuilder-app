const TEMPLATE_FAMILIES = {
  "Bathroom": "bathroom",
  "Kitchen": "kitchen",
  "Extensions & Conversions": "extension",
  "Building & Construction": "extension",
  "Roofing": "roofing",
  "Electrical": "electrical",
  "Plumbing": "plumbing",
  "Heating & Cooling": "plumbing",
  "Painting & Decorating": "painting",
  "Landscaping & Garden": "landscaping",
  "Fencing & Gates": "landscaping",
  "Windows": "windows",
  "Doors": "windows",
  "Insulation": "insulation",
  "Energy & Renewables": "insulation",
};

const VARIANT_COUNT = 5;

function assignTemplate(tradeTypes) {
  const primary = String(tradeTypes || "").split(",")[0]?.trim() || "";
  const family = TEMPLATE_FAMILIES[primary] || "general";
  const variant = Math.floor(Math.random() * VARIANT_COUNT) + 1;
  return `${family}-${variant}`;
}

module.exports = { assignTemplate, TEMPLATE_FAMILIES, VARIANT_COUNT };
