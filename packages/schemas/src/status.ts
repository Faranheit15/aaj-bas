import { z } from "zod";
import { editionDateSchema, timestampSchema } from "./dates";

export const systemHealthStatusSchema = z.enum([
  "healthy",
  "degraded",
  "warning",
  "offline",
]);

export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>;

export const statusArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: timestampSchema,
  status: systemHealthStatusSchema,
  latestEditionDate: editionDateSchema.nullable(),
  publishedEditionsCount: z.number().int().nonnegative(),
  sources: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
  }),
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      detail: z.string().optional(),
    }),
  ),
});

export type StatusArtifact = z.infer<typeof statusArtifactSchema>;
