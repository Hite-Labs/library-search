/**
 * The member's recently-played items, stored in the browser.
 *
 * ── Why localStorage, and not the database ──────────────────────────────────────────
 *
 * Two alternatives were considered and rejected for v1:
 *
 * Memberstack's member `json` field. It sounds free — the account already exists — but the
 * secret key is server-side only, so the browser cannot write to it. It needs a new
 * authenticated POST route regardless, the same one a Neon table needs. Worse, the write is
 * read-modify-write (see updateMemberMetaData in lib/memberstack.ts: retrieve, merge,
 * update, because Memberstack replaces the whole object). That is two network round trips
 * on the PLAY path — the moment audio starts — with a lost-update race if a member taps
 * play twice in quick succession. And it cannot be queried: answering "what are members
 * playing?" would mean paging through every member 100 at a time.
 *
 * A Neon table. The right architecture, and still the upgrade path (see below), but it
 * brings a migration, the widget's first write endpoint, rate limiting on that endpoint,
 * token verification, and a new way for the play path to fail — in exchange for cross-device
 * history nobody has asked for yet.
 *
 * localStorage is synchronous, so it costs nothing at the moment of play, and — the part
 * that actually decides it — it is readable on FIRST PAINT. The Memberstack token is not:
 * embed.js delivers it on the iframe's load event, after an async getCurrentMember(). A
 * server-backed history would be unreadable during exactly the window when the idle state
 * renders, so the shelf would paint one thing and then swap it for another.
 *
 * The real cost is that history is per-device. For sleep and hypnosis audio played from the
 * same phone night after night, that is acceptable — and a member opening this on a laptop
 * sees the curated shelf instead, which is a correct thing to see rather than an error.
 *
 * ── Upgrade path ────────────────────────────────────────────────────────────────────
 *
 * Everything reads and writes through this module. Moving to Neon means changing what is in
 * here plus adding a route; WidgetRoot and Player do not change. Do it when cross-device
 * history or "what are members listening to?" is actually asked for — not before.
 */

import type { Result } from '@/components/widget/types';

/** Matches the three-result convention the search list already uses. */
const MAX = 3;

/**
 * Bumped if the stored shape ever changes, so old entries are ignored rather than parsed
 * into something half-valid. readRecent also validates field-by-field, but a version in the
 * key means a shape change costs nothing to roll out.
 */
const VERSION = 1;

/**
 * Scoped to the member, never global.
 *
 * Shared phones and family tablets are real, and an unkeyed bucket would show one person's
 * listening history to whoever opened the page next. Falls back to an anonymous bucket for
 * the window before the token arrives (and for anyone who never gets one).
 */
export function bucketKey(memberId: string | null): string {
  return `sys:recent:v${VERSION}:${memberId ?? 'anon'}`;
}

/**
 * Every localStorage access here is wrapped, including the `window.localStorage` lookup
 * ITSELF — Safari in private mode throws on the property access, not just on setItem. This
 * function must never throw: it runs during render of the idle state, and a storage quirk
 * on someone's phone must not take out the widget.
 */
function readRaw(key: string): string | null {
  // The `typeof window` guard is for the server, not the browser: /widget is statically
  // prerendered, so this module is evaluated during the build where there is no window at
  // all. The try/catch is the browser half — Safari private mode throws on the property
  // access itself, before getItem is ever called.
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Is this parsed object actually playable? Guards against a stored shape from an older build. */
function isUsable(item: unknown): item is Result {
  if (!item || typeof item !== 'object') return false;
  const r = item as Partial<Result>;
  // Checks every field a card or the player reads, not just the ones needed to play. The
  // display fields would not crash if missing — DetailPanel's tag split already guards on
  // falsiness — but a half-written entry would render a card with an empty description and
  // no explanation, and dropping it is both cheaper and more honest than showing it.
  return (
    typeof r.id === 'string' &&
    typeof r.publicUrl === 'string' &&
    typeof r.mediaType === 'string' &&
    typeof r.title === 'string' &&
    typeof r.description === 'string' &&
    typeof r.useCases === 'string' &&
    typeof r.moodTags === 'string'
  );
}

/** The stored list, newest first. Returns [] for anything unreadable or malformed. */
export function readRecent(key: string): Result[] {
  const raw = readRaw(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isUsable).slice(0, MAX);
  } catch {
    return [];
  }
}

/**
 * Record a play and return the new list.
 *
 * Stores whole Result objects rather than ids. Result already carries everything needed to
 * both render a card and play the file, so there is no hydration fetch on load and no
 * "stored an id, the row is gone" case to handle. Same reasoning that made `selected` hold
 * the object rather than an id in WidgetRoot.
 *
 * The trade-off: a stored publicUrl goes stale if the file is re-uploaded under a new R2
 * key. The player then fails to load — degraded, not crashing — and at three entries the
 * list churns out quickly. Not worth a revalidation round trip for three rows.
 *
 * Re-playing something already in the list moves it to the front rather than duplicating it.
 */
export function recordPlay(key: string, item: Result): Result[] {
  const next = [item, ...readRecent(key).filter((r) => r.id !== item.id)].slice(0, MAX);
  if (typeof window === 'undefined') return next;
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Quota exceeded, private mode, storage disabled. The in-memory list this returns is
    // still correct for the rest of the session; only persistence is lost.
  }
  return next;
}
