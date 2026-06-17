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

export type LoginInput = z.infer<typeof LoginSchema>;
export type PresignInput = z.infer<typeof PresignSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
export type FinalizeUploadInput = z.infer<typeof FinalizeUploadSchema>;
export type SuggestInput = z.infer<typeof SuggestSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
