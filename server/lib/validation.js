// server/v2/lib/validation.js
const { z } = require("zod");

const ProjectSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(80),
  location: z.string().min(2).max(120),
  description: z.string().min(2).max(2000),
  propertyType: z.string().min(2).max(80),
  bedrooms: z.number().int().min(0).max(20),
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
    rating: z.coerce.number().int().min(1).max(5).optional(),
    hireAgain: z.enum(["yes", "no"]).optional(),
    comment: z.string().min(10).max(2000),
  })
  .transform((v) => ({
    ...v,
    rating:
      typeof v.rating === "number" ? v.rating : v.hireAgain === "yes" ? 5 : 3,
  }));

module.exports = { ProjectSchema, RecSchema };
