// Which days of a challenge a member may see right now.
//
// Pure functions with no DB or network access, so the rule can be tested directly and used
// identically by the API and the dashboard preview. The portal script never runs this: the
// server sends the day list, exactly as it does for locked cohort sessions, because "hidden
// in the browser" is not "not sent".
//
// Everything here is a COUNT OF DAYS from the start, never a stored date. A run is "21 days
// of content, open for 45, closed to new joiners after 10" — those numbers move together
// when the run does, and a three-month challenge is the same three numbers with different
// values rather than a different feature.

export interface ChallengeSchedule {
  /** When day 1 unlocks. Null means the run has no dates yet and reveals nothing. */
  start_date: string | null;
  /** How many days of content the run has. */
  total_days: number;
  /**
   * How long the run stays open, counted from day 1 — NOT extra days on the end. A 21-day
   * run with open_for_days = 45 gives 24 days of catch-up after the last drop.
   */
  open_for_days: number;
  /**
   * How many days after the start someone can still join and get this run's content.
   * 0 means no cutoff — anyone can join for as long as the run is open. Someone arriving
   * after it keeps their account and sees the upsells; they simply wait for the next run.
   */
  join_cutoff_days: number;
  /** "HH:MM" in reveal_timezone. */
  reveal_time: string;
  /** IANA zone, e.g. "America/New_York". */
  reveal_timezone: string;
}

/**
 * The absolute instant day N unlocks.
 *
 * The subtlety this exists for: "day 4 at 6am Eastern" is not start_date plus a fixed number
 * of hours. Adding 3×24h across a DST boundary lands at 5am or 7am — the same bug already
 * fixed once in the cohort scheduler (see generateCohortSchedule). So the calendar date is
 * advanced first, then the wall-clock time is resolved in the target zone.
 *
 * Returns null when the challenge has no start date or an unparseable one.
 */
export function unlockInstant(
  schedule: Pick<ChallengeSchedule, 'start_date' | 'reveal_time' | 'reveal_timezone'>,
  day: number,
): Date | null {
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
 * renders it, and shift. Two passes because the first shift can itself cross a DST boundary
 * and change the offset.
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
 * Whole calendar days from `from` to `to`, counted in the given zone.
 *
 * Both instants are reduced to their calendar date in `timeZone` first, then subtracted as
 * plain dates. That is what makes this DST-proof: the hour an offset change adds or removes
 * never reaches the arithmetic, because the times of day are discarded before it.
 *
 * Counting dates also matches how someone reads "3 more days" — it is the number of day
 * boundaries ahead, not a duration rounded down. A run closing tomorrow morning reads 1 all
 * of today, rather than dropping to 0 once fewer than 24 hours remain.
 *
 * Never negative, and null if either instant can't be placed in the zone (an invalid IANA
 * name, already the guarded case in zonedParts).
 */
function daysBetween(from: Date, to: Date, timeZone: string): number | null {
  const a = zonedParts(from, timeZone);
  const b = zonedParts(to, timeZone);
  if (!a || !b) return null;

  // UTC purely as a calendar here — no time component survives on either side, so this is a
  // date subtraction and the 86400000 is exact rather than an approximation of elapsed time.
  const fromDay = Date.UTC(a.year, a.month - 1, a.day);
  const toDay = Date.UTC(b.year, b.month - 1, b.day);
  return Math.max(0, Math.round((toDay - fromDay) / 86400000));
}

export interface ChallengeAccess {
  /** Day numbers this member may see right now. */
  unlocked: number[];
  /** The highest unlocked day, or null before the run starts. */
  current_day: number | null;
  /** When the run closes to everyone. */
  closes_at: string | null;
  /**
   * Whole days of access left, for "available for X more days".
   *
   * Counted here rather than in the browser for the same reason everything else in this file
   * is: the close instant is a wall-clock time in reveal_timezone, so a member's device clock
   * and zone would give a different answer than the server's — and across a DST boundary the
   * naive (ms / 86400000) the browser would reach for is off by an hour, which flips the
   * floor on the day either side of the change.
   *
   * Null when there is no start date, matching how current_day signals "not applicable".
   * Never negative: a closed run reads 0, not -3.
   */
  days_remaining: number | null;
  /** Last moment someone can join and still get this run. Null when there is no cutoff. */
  join_closes_at: string | null;
  started: boolean;
  /** The run's open window has passed. */
  closed: boolean;
  /** Still running, but too late to join — a newcomer waits for the next run. */
  join_closed: boolean;
}

/**
 * What a member may see of this run right now.
 *
 * `unlocked` is every day whose reveal instant has passed, capped at total_days — so someone
 * joining mid-run sees days 1..today at once and continues with everyone else, which is what
 * lets one daily email serve the whole run.
 *
 * Note what this does NOT decide: whether the person has an account, or whether they see the
 * portal at all. A closed run means no challenge content, never a locked-out member — the
 * challenge is the front door to the membership, so someone who finishes it (or arrives too
 * late for it) keeps their account and sees what else is on offer. That is the point of the
 * whole thing, and it is handled in the portal route, not here.
 */
export function challengeAccess(
  schedule: ChallengeSchedule,
  now: Date = new Date(),
): ChallengeAccess {
  const total = Math.max(0, schedule.total_days | 0);

  // The window runs from day 1, so "open for 45" ends at the day-46 boundary — the run is
  // open THROUGH day 45. Never shorter than the content itself: a mis-set open_for_days
  // would otherwise close the run before its last day dropped, which is silently losing
  // content people paid for. The form blocks it; this makes it impossible.
  const openDays = Math.max(schedule.open_for_days | 0, total);
  const closesAt = unlockInstant(schedule, openDays + 1);

  const empty = (): ChallengeAccess => ({
    unlocked: [],
    current_day: null,
    closes_at: closesAt ? closesAt.toISOString() : null,
    days_remaining: null,
    join_closes_at: null,
    started: false,
    closed: false,
    join_closed: false,
  });

  if (!schedule.start_date) return empty();

  // Whole days from now until the run closes. Both instants are converted to calendar dates
  // in the reveal zone before subtracting, so the answer is "how many more sleeps" as the
  // run's own timezone counts them — not a millisecond division, which drifts by an hour
  // across a DST change and would tip the floor on one of the two days around it.
  const daysRemaining = closesAt === null ? null : daysBetween(now, closesAt, schedule.reveal_timezone);

  // 0 means no cutoff. Otherwise joining is open THROUGH that day, so the boundary is the
  // start of the following one — same convention as the open window above.
  const cutoff = Math.max(0, schedule.join_cutoff_days | 0);
  const joinClosesAt = cutoff > 0 ? unlockInstant(schedule, cutoff + 1) : null;
  const joinClosed = joinClosesAt !== null && now >= joinClosesAt;

  if (closesAt !== null && now >= closesAt) {
    return {
      unlocked: [],
      current_day: null,
      closes_at: closesAt.toISOString(),
      // Past the close instant, so this is 0 rather than a negative count.
      days_remaining: 0,
      join_closes_at: joinClosesAt ? joinClosesAt.toISOString() : null,
      started: true,
      closed: true,
      join_closed: joinClosed,
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
    closes_at: closesAt ? closesAt.toISOString() : null,
    days_remaining: daysRemaining,
    join_closes_at: joinClosesAt ? joinClosesAt.toISOString() : null,
    started: unlocked.length > 0,
    closed: false,
    join_closed: joinClosed,
  };
}
