import { z } from 'zod/v4';

// ─── Sync Events ──────────────────────────────────────────────────

export const SyncProgressEventSchema = z.object({
  syncRunId: z.string(),
  stage: z.string(),
  percent: z.number().min(0).max(100),
  message: z.string(),
});

export type SyncProgressEvent = z.infer<typeof SyncProgressEventSchema>;

export const SyncCompleteEventSchema = z.object({
  syncRunId: z.string(),
  duration: z.number(),
  recordsProcessed: z.number(),
});

export type SyncCompleteEvent = z.infer<typeof SyncCompleteEventSchema>;

export const SyncErrorEventSchema = z.object({
  syncRunId: z.string(),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export type SyncErrorEvent = z.infer<typeof SyncErrorEventSchema>;
