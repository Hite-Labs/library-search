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
  /**
   * How closely this matched the query, 0–1.
   *
   * null for items that did not come from a search — the Getting Started shelf and the
   * recently-played list. There is no query to have matched, so there is no score to
   * report, and ResultCard omits the "% match" line rather than rendering "0% match".
   */
  similarity: number | null;
}

/**
 * One Getting Started item, as GET /api/getting-started returns it.
 *
 * Deliberately mirrors `GettingStartedItem` in lib/db.ts rather than importing it. No
 * client component in this repo imports from lib/db.ts, and `import type` across that
 * boundary is a precedent worth not setting for nine fields: lib/db.ts pulls in the Neon
 * driver, and a future refactor that turns this type import into a value import would
 * drag the database client into the widget bundle before anyone noticed.
 *
 * The API speaks snake_case because it is reading columns straight out of Postgres. The
 * widget speaks camelCase. gettingStartedToResult below is the whole translation.
 */
export interface GettingStartedItem {
  id: string;
  title: string;
  description: string;
  media_type: 'audio' | 'video' | 'pdf';
  public_url: string;
  duration_seconds: number | null;
  use_cases: string;
  mood_tags: string;
  modality: string | null;
}

/** The shape of the whole GET /api/getting-started payload. */
export interface GettingStarted {
  primary: GettingStartedItem | null;
  secondary: GettingStartedItem[];
}

/**
 * Turn a Getting Started item into a Result, so the idle shelf can reuse ResultCard,
 * DetailPanel and Player unchanged instead of growing a parallel set of components.
 *
 * The two types describe the same row; only the casing differs, plus `similarity`, which
 * a curated item cannot have.
 */
export function gettingStartedToResult(item: GettingStartedItem): Result {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    mediaType: item.media_type,
    publicUrl: item.public_url,
    durationSeconds: item.duration_seconds,
    useCases: item.use_cases,
    moodTags: item.mood_tags,
    modality: item.modality,
    similarity: null,
  };
}
