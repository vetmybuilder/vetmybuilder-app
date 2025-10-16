// server/v2/routes/verify-company.test.get.js
/**
 * GET /api/v2/verify-company/test
 * Auth: none, but must pass X-Test-Secret via assertTestAccess
 */
module.exports = (router, ctx) => {
  const { assertTestAccess, getCompanyProfile, searchCompanies, matchByName } =
    ctx;
  const { _roughNameScore } = require("../lib/companyVerifyHelpers");

  router.get("/verify-company/test", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    try {
      const companyNumber =
        String(req.query.companyNumber || "").trim() || undefined;
      const name = String(req.query.name || "").trim() || undefined;
      const postcode = String(req.query.postcode || "").trim() || undefined;
      const scored =
        String(req.query.scored || "").trim() === "1" ||
        String(req.query.strategy || "")
          .trim()
          .toLowerCase() === "match";

      if (companyNumber) {
        const profile = await getCompanyProfile(companyNumber);
        return res.json({
          ok: true,
          method: "number",
          matchScore: 100,
          company: {
            number: profile.company_number,
            name: profile.company_name,
            status: profile.company_status ?? null,
            dateOfCreation: profile.date_of_creation ?? null,
            address: profile.registered_office_address ?? null,
            sicCodes: profile.sic_codes ?? [],
          },
        });
      }

      if (!name) {
        return res
          .status(400)
          .json({ ok: false, error: "Missing 'name' or 'companyNumber'." });
      }

      if (scored) {
        const result = await matchByName({
          name,
          locationHint: postcode || undefined,
        });
        return res.json({ ok: true, ...result });
      }

      const search = await searchCompanies({ name, itemsPerPage: 50 });
      const items = Array.isArray(search.items) ? search.items : [];
      if (items.length === 0)
        return res.json({ ok: false, error: "No matches" });

      const ranked = items
        .filter((i) => i.title && i.company_number)
        .map((i) => ({ ...i, _score: _roughNameScore(i.title, name) }))
        .sort((a, b) => b._score - a._score);

      const best = ranked[0];
      if (!best) return res.json({ ok: false, error: "No matches" });
      if (best._score < 70) {
        return res.json({
          ok: false,
          error: "No confident match",
          bestGuess: {
            number: best.company_number,
            title: best.title,
            score: best._score,
          },
        });
      }

      const profile = await getCompanyProfile(best.company_number);
      return res.json({
        ok: true,
        method: "search",
        matchScore: best._score,
        company: {
          number: profile.company_number,
          name: profile.company_name,
          status: profile.company_status ?? null,
          dateOfCreation: profile.date_of_creation ?? null,
          address: profile.registered_office_address ?? null,
          sicCodes: profile.sic_codes ?? [],
        },
      });
    } catch (e) {
      const status = e?.status || 500;
      return res.status(status).json({
        ok: false,
        error: e?.message || "CH error",
        status,
        body: e?.body,
      });
    }
  });
};
