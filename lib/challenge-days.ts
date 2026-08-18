// Which days of a challenge a member may see right now.
//
// Pure functions with no DB or network access, so the rule can be tested directly and
// used identically by the API and any future caller. The portal script never runs this:
// the server sends the day list, exactly as it does for locked cohort sessions, because
// "hidden in the browser" is not "not sent".

export interface ChallengeSchedule {
  /** When day 1 unlocks. Null means the run has no dates yet and reveals nothing. */
  start_date: string | null;
  total_days: number;
  /** "HH:MM" in reveal_timezone. */
  reveal_time: string;
  /** IANA zone, e.g. "America/New_York". */
  reveal_timezone: string;
  /** Days of access after the final day. 0 ends access with the last day. */
  grace_days: number;
}

/**
 * The absolute instant day N unlocks.
 *
 * The subtlety this exists for: "day 4 at 6am Eastern" is not start_date plus a fixed
 * number of hours. Adding 3×24h across a DST boundary lands at 5am or 7am — the same bug
 * already fixed once in the cohort scheduler (see generateCohortSchedule). So the calendar
 * date is advanced first, then the wall-clock time is resolved in the target zone.
 *
 * Returns null when the challenge has no start date or an unparseable one.
 */
export function unlockInstant(schedule: ChallengeSchedule, day: number): Date | null {
  if (!schedule.start_date) return null;
  const start = new Date(schedule.start_date);
  if (Number.isNaN(start.getTime())) return null;

  // Calendar date of day N, in the reveal zone. Day 1 is the start date itself.
  const parts = zonedParts(start, schedule.reveal_timezone);
  if (!parts) return null;

  // Date arithmetic in UTC purely as a calendar: Date.UTC normalises month/year rollover,
  // and no time component survives — the wall-clock time is applied separately below.
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (day - 1)));

  const [hh, mm] = parseRevealTime(schedule.reveal_time);
  return zonedWallClockToInstant(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    hh,
    mm,
    schedule.reveal_timezone,
  );
}

/** "HH:MM" → [hours, minutes]. Falls back to 06:00 on anything unparseable. */
function parseRevealTime(value: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
  if (!m) return [6, 0];
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return [6, 0];
  return [hh, mm];
}

/** The calendar date an instant falls on, in a given zone. */
function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [year, month, day] = fmt.format(date).split('-').map(Number);
    return { year, month, day };
  } catch {
    // An invalid IANA zone would otherwise throw on every request.
    return null;
  }
}

/**
 * The instant at which a given wall-clock time occurs in a given zone.
 *
 * Intl can tell us what a UTC instant looks like in a zone, but not the reverse, so this
 * guesses and corrects: start from the naive UTC reading, measure how far off the zone
 * renders it, and shift. Two passes because the first shift can itself cross a DST
 * boundary and change the offset.
 */
function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date | null {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(wanted);

  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMs(guess, timeZone);
    if (offset === null) return null;
    const corrected = new Date(wanted - offset);
    if (corrected.getTime() === guess.getTime()) break;
    guess = corrected;
  }
  return guess;
}

/** How far ahead of UTC a zone is at a given instant, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string): number | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(date)) {
      if (part.type !== 'literal') p[part.type] = Number(part.value);
    }
    // hour can format as 24 for midnight in some locales/zones; normalise so Date.UTC
    // doesn't silently roll the date forward.
    const hour = p.hour === 24 ? 0 : p.hour;
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, hour, p.minute, p.second);
    return asUTC - date.getTime();
  } catch {
    return null;
  }
}

/**
 * Day numbers a member may see right now, and when access ends.
 *
 * `unlocked` is every day whose reveal instant has passed, capped at total_days — so a
 * member joining mid-run sees days 1..today at once, which is what lets one daily email
 * serve everyone.
 *
 * Access ends grace_days after the final day's reveal. Past that the list is empty: the
 * run is over and its content stops being sent, not merely hidden.
 */
export function challengeAccess(
  schedule: ChallengeSchedule,
  now: Date = new Date(),
): {
  unlocked: number[];
  current_day: number | null;
  access_ends_at: string | null;
  started: boolean;
  ended: boolean;
} {
  const total = Math.max(0, schedule.total_days | 0);
  const lastReveal = total > 0 ? unlockInstant(schedule, total) : null;

  const endsAt =
    lastReveal === null
      ? null
      : new Date(lastReveal.getTime() + Math.max(0, schedule.grace_days | 0) * 86400000);

  if (endsAt !== null && now >= endsAt) {
    return {
      unlocked: [],
      current_day: null,
      access_ends_at: endsAt.toISOString(),
      started: true,
      ended: true,
    };
  }

  const unlocked: number[] = [];
  for (let day = 1; day <= total; day++) {
    const at = unlockInstant(schedule, day);
    if (at === null) break;
    if (now >= at) unlocked.push(day);
    else break; // days are strictly ordered, so the first future day ends it
  }

  return {
    unlocked,
    current_day: unlocked.length > 0 ? unlocked[unlocked.length - 1] : null,
    access_ends_at: endsAt ? endsAt.toISOString() : null,
    started: unlocked.length > 0,
    ended: false,
  };
}
