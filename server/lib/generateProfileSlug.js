function generateSlug(companyName, fallbackUsername) {
  const name = String(companyName || "").trim();
  if (name) {
    const slug = name
      .toLowerCase()
      .replace(/['']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug) return slug;
  }
  const fb = String(fallbackUsername || "").trim();
  return fb || null;
}

module.exports = { generateSlug };
