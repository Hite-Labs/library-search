import { z } from 'zod';

export const LoginSchema = z.object({
  password: z.string().min(1),
});

export const PresignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'pdf']),
});

export const AnalyzeSchema = z.object({
  publicUrl: z.string().url(),
  mediaType: z.enum(['audio', 'video', 'pdf']),
});

export const FinalizeUploadSchema = z.object({
  r2Key: z.string().min(1),
  publicUrl: z.string().url(),
  title: z.string().min(1),
  description: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'pdf']),
  useCases: z.string(),
  modality: z.string(),
  moodTags: z.string(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  transcript: z.string().nullable(),
});

export const SuggestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});

export const SearchSchema = z.object({
  query: z.string().min(1).max(500),
  memberstackUserId: z.string().optional(),
});

// ── Client management ────────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  goal: z.string().default(''),
  totalSessions: z.number().int().positive().default(6),
});

export const AddEnrollmentSchema = z.object({
  goal: z.string().default(''),
  totalSessions: z.number().int().positive().default(6),
  programType: z.enum(['individual', 'cohort']).default('individual'),
});

export const UpdateEnrollmentSchema = z.object({
  goal: z.string().optional(),
  status: z.enum(['active', 'paused', 'complete']).optional(),
  nextSessionAt: z.string().datetime().nullable().optional(),
  totalSessions: z.number().int().positive().optional(),
});

export const SessionLogSchema = z.object({
  notes: z.string().default(''),
  nextActions: z.string().default(''),
  sessionDate: z.string().datetime().optional(),
});

// Attach a recording to a client, two modes:
// (a) attach an existing content_items row by contentId (e.g. from the upload flow)
// (b) paste an existing R2 link → create a new private client recording row
export const AttachRecordingSchema = z
  .object({
    sessionLabel: z.string().nullable().default(null),
    enrollmentId: z.string().uuid().nullable().default(null),
    // mode (a)
    contentId: z.string().uuid().optional(),
    // mode (b)
    title: z.string().min(1).optional(),
    publicUrl: z.string().url().optional(),
    r2Key: z.string().min(1).optional(),
    mediaType: z.enum(['audio', 'video', 'pdf']).optional(),
  })
  .refine(
    (d) => d.contentId || (d.title && d.publicUrl && d.r2Key && d.mediaType),
    { message: 'Provide either contentId, or title + publicUrl + r2Key + mediaType' },
  );

// ── Cohorts ──────────────────────────────────────────────────────────────────

export const CreateCohortSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  goal: z.string().default(''),
  totalSessions: z.number().int().positive().default(4),
});

export const UpdateCohortSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
  status: z.enum(['active', 'complete', 'archived']).optional(),
  totalSessions: z.number().int().positive().optional(),
  currentSession: z.number().int().nonnegative().optional(),
  zoomUrl: z.string().optional(),
});

export const CohortSessionSchema = z.object({
  label: z.string().default(''),
  sessionDate: z.string().datetime().nullable().default(null),
  sortOrder: z.number().int().default(0),
});

export const UpdateCohortSessionSchema = z.object({
  label: z.string().optional(),
  sessionDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const AddCohortMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  goal: z.string().default(''),
});

export const CohortContentSchema = z.object({
  title: z.string().min(1),
  publicUrl: z.string().url(),
  r2Key: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'pdf']),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type PresignInput = z.infer<typeof PresignSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadSchema>;
export type SuggestInput = z.infer<typeof SuggestSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
