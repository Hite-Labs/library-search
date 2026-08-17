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

// programType decides which enrollment(s) are created and which Memberstack plan(s)
// the member is given. 'cohort' and 'both' need a cohortId to enrol into.
export const CreateClientSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().default(''),
    email: z.string().email(),
    goal: z.string().default(''),
    totalSessions: z.number().int().positive().default(6),
    programType: z.enum(['individual', 'cohort', 'both']).default('individual'),
    cohortId: z.string().uuid().optional(),
  })
  .refine((d) => d.programType === 'individual' || Boolean(d.cohortId), {
    message: 'Pick a cohort when the program type is cohort or both',
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
  calendarUrl: z.string().optional(),
});

export const SessionLogSchema = z.object({
  notes: z.string().default(''),
  nextActions: z.string().default(''),
  coachActions: z.string().default(''),
  sessionDate: z.string().datetime().optional(),
});

// Attach a recording to a client, two modes:
// (a) attach an existing content_items row by contentId (e.g. from the upload flow)
// (b) paste an existing R2 link → create a new private client recording row
export const AttachRecordingSchema = z
  .object({
    sessionLabel: z.string().nullable().default(null),
    enrollmentId: z.string().uuid().nullable().default(null),
    // 'recording' = session Zoom calls; 'file' = standalone Resources (EFT/hypno audio, PDFs).
    kind: z.enum(['recording', 'file']).default('recording'),
    description: z.string().default(''),
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
  telegramUrl: z.string().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  sessionCadence: z.enum(['weekly', 'biweekly']).optional(),
});

export const UpdateCohortSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
  status: z.enum(['active', 'complete', 'archived']).optional(),
  totalSessions: z.number().int().positive().optional(),
  currentSession: z.number().int().nonnegative().optional(),
  zoomUrl: z.string().optional(),
  telegramUrl: z.string().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  sessionCadence: z.enum(['weekly', 'biweekly']).optional(),
});

export const CohortSessionSchema = z.object({
  title: z.string().default(''),
  sessionDate: z.string().datetime().nullable().default(null),
  sortOrder: z.number().int().default(0),
  promptText: z.string().default(''),
});

export const UpdateCohortSessionSchema = z.object({
  title: z.string().optional(),
  sessionDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
  promptText: z.string().optional(),
});

export const GenerateScheduleSchema = z.object({
  startDate: z.string().datetime(),
  cadence: z.enum(['weekly', 'biweekly']),
  totalSessions: z.number().int().positive(),
  // Replace the cohort's existing dated rows instead of adding a second set. Defaults to
  // false: replacing deletes rows that content_items may point at, so the caller has to ask
  // for it deliberately.
  replaceExisting: z.boolean().default(false),
});

// Two modes, mirroring AttachRecordingSchema:
// (a) pick an existing person by clientId
// (b) create/dedupe from name + email
// name/email are optional so mode (a) can omit them entirely; the refine enforces that
// one complete mode is present.
export const AddCohortMemberSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    goal: z.string().default(''),
  })
  .refine((d) => d.clientId || (d.name && d.email), {
    message: 'Provide either clientId, or name + email',
  });

// The three cohort content shapes are distinguished by which columns are set, so both
// scoping fields are optional and default to null (see db/schema.sql:135-143):
//   cohortSessionId set          → that session's files
//   both null                    → cohort-wide, every member sees it
//   clientId set                 → private to that member within the cohort (my_files)
export const CohortContentSchema = z.object({
  title: z.string().min(1),
  publicUrl: z.string().url(),
  r2Key: z.string().min(1),
  mediaType: z.enum(['audio', 'video', 'pdf']),
  cohortSessionId: z.string().uuid().nullable().default(null),
  clientId: z.string().uuid().nullable().default(null),
});

// ── Library (public content browser) ─────────────────────────────────────────

// Every field is optional — PATCH semantics, omitted fields are left untouched.
// modality and durationSeconds are explicitly nullable so they can be cleared.
//
// mediaType is deliberately NOT editable: it determines the R2 key prefix, which
// Webflow url field the media lands in (audio-url vs video-url), and which player
// branch renders. Changing it would desynchronise all three from the object that's
// actually stored, so a mis-typed file gets re-uploaded rather than edited.
export const UpdateLibraryItemSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  useCases: z.string().optional(),
  modality: z.string().nullable().optional(),
  moodTags: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type PresignInput = z.infer<typeof PresignSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadSchema>;
export type SuggestInput = z.infer<typeof SuggestSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type UpdateLibraryItemInput = z.infer<typeof UpdateLibraryItemSchema>;
