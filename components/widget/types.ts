/**
 * One search result, as /api/search returns it.
 *
 * Shared rather than redeclared: this interface was hand-copied into WidgetRoot,
 * ResultsList and ResultCard, so adding a field meant editing three files and any
 * miss showed up as a silently-dropped prop (`id` was already being spread into
 * ResultCard and discarded, because its local copy didn't declare it).
 *
 * Field names are camelCase here and snake_case in the database; app/api/search
 * maps between them.
 */
export interface Result {
  id: string;
  title: string;
  description: string;
  mediaType: string;
  /**
   * The media file itself, on R2. A stable, permanent URL — deliberately not a
   * presigned one. Members play these for sleep hypnosis, so a track has to survive
   * being paused at 11pm and resumed at 3am; a 1-hour signature would 403 mid-session
   * on the next seek or re-buffer, with no recovery path in the audio element.
   *
   * Entitlement is enforced upstream instead, in the query: an anonymous caller's SQL
   * hard-filters cohort content out, and a member only ever matches their own cohorts.
   */
  publicUrl: string;
  /** Nullable, and null for almost every row today — the player reads the real duration from the file. */
  durationSeconds: number | null;
  useCases: string;
  moodTags: string;
  modality: string | null;
  similarity: number;
}
