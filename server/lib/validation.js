// server/v2/lib/validation.js
const { z } = require("zod");
const { HIRE_CANCEL_REASONS } = require("./hireCancelReasons");

const ProjectSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(80),
  location: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  propertyType: z.string().min(2).max(80),
  bedrooms: z.number().int().min(0).max(20),
  // Category-specific structured answers. Shape is validated separately
  // against server/lib/jobFields.js to keep schema-awareness out of Zod.
  answers: z.record(z.any()).optional(),
});

const RecSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z
      .string()
      .email()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    phone: z
      .string()
      .min(3)
      .max(40)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    company: z.string().min(1).max(200),
    companyEmail: z
      .string()
      .email()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    hireAgain: z.enum(["yes", "no"]).optional(),
    // Per-category star ratings (optional). Mobile recommend wizard sends
    // these; the legacy desktop form leaves them undefined.
    qualityRating: z.coerce.number().int().min(1).max(5).optional(),
    reliabilityRating: z.coerce.number().int().min(1).max(5).optional(),
    communicationRating: z.coerce.number().int().min(1).max(5).optional(),
    trustRating: z.coerce.number().int().min(1).max(5).optional(),
    valueRating: z.coerce.number().int().min(1).max(5).optional(),
    // Comment is optional. If supplied, must fit within 2000 chars.
    // Empty strings are normalised to undefined so they're stored as NULL.
    comment: z
      .string()
      .max(2000)
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .transform((v) => {
    // If the recommender filled in any category stars, derive the overall
    // `rating` from their average so legacy code paths still work.
    const cats = [
      v.qualityRating,
      v.reliabilityRating,
      v.communicationRating,
      v.trustRating,
      v.valueRating,
    ].filter((n) => typeof n === "number");
    const avg = cats.length
      ? Math.round(cats.reduce((a, b) => a + (b || 0), 0) / cats.length)
      : null;
    return {
      ...v,
      rating:
        typeof v.rating === "number"
          ? v.rating
          : avg ?? (v.hireAgain === "yes" ? 5 : 3),
    };
  });

// ---------------------------------------------------------------------------
// Hires
// ---------------------------------------------------------------------------

/**
 * Body for POST /api/projects/:projectId/hires
 *
 * Exactly one of `tradesmanUserId` (onboarded tradesman) or `recommendationId`
 * (unjoined recommendation) must be provided. Enforced via .superRefine.
 */
const CreateHireSchema = z
  .object({
    tradesmanUserId: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    recommendationId: z.coerce.number().int().positive().optional(),
    homeownerMessage: z
      .string()
      .max(1000)
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((val, ctx) => {
    const hasTradesman = !!val.tradesmanUserId;
    const hasRecommendation = val.recommendationId != null;

    if (hasTradesman && hasRecommendation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide either tradesmanUserId or recommendationId, not both.",
        path: ["tradesmanUserId"],
      });
    } else if (!hasTradesman && !hasRecommendation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either tradesmanUserId or recommendationId.",
        path: ["tradesmanUserId"],
      });
    }
  });

/**
 * Body for PATCH /api/hires/:id/accept and PATCH /api/hires/:id/decline.
 *
 * Both endpoints accept an optional free-text message from the tradesman.
 * The decline endpoint may extend this in the future (e.g. a `reason` enum)
 * — for now they share the same shape.
 */
const RespondHireSchema = z.object({
  tradesmanMessage: z
    .string()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * Body for PATCH /api/hires/:id/cancel.
 *
 * `cancelReason` is validated against the canonical list in
 * server/lib/hireCancelReasons.js. The route handler enforces the
 * "required when accepted" rule because Zod can't see the DB.
 */
const CancelHireSchema = z.object({
  cancelReason: z
    .enum(HIRE_CANCEL_REASONS)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

module.exports = {
  ProjectSchema,
  RecSchema,
  CreateHireSchema,
  RespondHireSchema,
  CancelHireSchema,
};
