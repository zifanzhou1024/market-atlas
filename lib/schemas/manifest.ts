import { z } from "zod";

const isoDateTime = z.string().datetime();

export const SourceStatusSchema = z.object({
  displayName: z.string().min(1),
  status: z.enum(["ok", "stale", "failed"]),
  latestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  rowCount: z.number().int().nonnegative(),
  sourceUrls: z.array(z.string().url()).min(1),
  lastSuccessfulFetchAt: isoDateTime.nullable(),
  lastAttemptedFetchAt: isoDateTime,
  errorMessage: z.string().min(1).nullable()
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: isoDateTime,
  generatedBy: z.object({
    ref: z.string().min(1),
    sha: z.string().min(1).nullable(),
    runId: z.string().min(1).nullable(),
    runUrl: z.string().url().nullable()
  }),
  validationTier: z.literal("L3"),
  sources: z.object({
    shiller: SourceStatusSchema,
    buffett: SourceStatusSchema,
    spxWeekdays: SourceStatusSchema
  })
});

export type SourceStatus = z.infer<typeof SourceStatusSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
