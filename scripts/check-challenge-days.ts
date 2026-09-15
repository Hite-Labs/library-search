// Verification for challengeAccess().days_remaining — the "available for X more days" count.
//
//     npx tsx scripts/check-challenge-days.ts
//
// There is no test runner in this project (deliberately — QA is documented in docs/qa-plan.md
// and run by hand), so this is a standalone script rather than a spec file. It needs no
// dependencies beyond tsx and touches no database: challenge-days.ts is pure by design,
// which is what makes checking the DST cases cheap.
//
// ⚠️ Fixture format matters. start_date MUST carry a time ('2026-09-03T06:00'), the way the
// dashboard's datetime-local input saves it. A bare '2026-09-03' parses as UTC midnight,
// which is the PREVIOUS calendar day in America/New_York — so every day, and the close date,
// lands 24h early. Real runs saved through /challenges are unaffected; only hand-written
// bare dates are. This cost a debugging session once.
import { challengeAccess, type ChallengeSchedule } from '../lib/challenge-days';

// The live run's real values, per docs/qa-plan.md §6b-ii.
const RUN: ChallengeSchedule = {
  start_date: '2026-09-03T06:00',
  total_days: 21,
  open_for_days: 45,
  join_cutoff_days: 10,
  reveal_time: '06:00',
  reveal_timezone: 'America/New_York',
};

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}\n        got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

const at = (iso: string) => challengeAccess(RUN, new Date(iso));

// Run opens 2026-09-03 06:00 ET, open_for_days 45 -> closes at the day-46 boundary,
// i.e. 2026-10-18 06:00 ET. Counting calendar dates in ET from each "now".

console.log('\n-- basic span --');
check('day 1, just after open', at('2026-09-03T10:00:00Z').days_remaining, 45);
check('mid-run (day 10)', at('2026-09-12T14:00:00Z').days_remaining, 36);
check('day 21, last content day', at('2026-09-23T14:00:00Z').days_remaining, 25);
check('after content, still open (day 30)', at('2026-10-02T14:00:00Z').days_remaining, 16);
check('day before close', at('2026-10-17T14:00:00Z').days_remaining, 1);

console.log('\n-- boundaries --');
check('closed: past the window', at('2026-11-01T14:00:00Z').days_remaining, 0);
check('closed: state is finished', at('2026-11-01T14:00:00Z').closed, true);
check('never negative', at('2027-06-01T14:00:00Z').days_remaining, 0);

console.log('\n-- null start date --');
const noStart = challengeAccess({ ...RUN, start_date: null }, new Date('2026-09-12T14:00:00Z'));
check('no start date -> null', noStart.days_remaining, null);

console.log('\n-- DST boundary (US falls back 2026-11-01) --');
// A run spanning the change: the naive ms/86400000 the browser would use gains an hour
// across fall-back, which can tip the floor. Calendar-date counting must not.
const DST: ChallengeSchedule = { ...RUN, start_date: '2026-10-25T06:00', open_for_days: 14, total_days: 7 };
// opens 10-25 06:00 ET, closes at day-15 boundary = 11-08 06:00 ET. Clocks change 11-01.
check('before the change', challengeAccess(DST, new Date('2026-10-30T14:00:00Z')).days_remaining, 9);
check('day of the change', challengeAccess(DST, new Date('2026-11-01T14:00:00Z')).days_remaining, 7);
check('after the change', challengeAccess(DST, new Date('2026-11-03T14:00:00Z')).days_remaining, 5);

console.log('\n-- open_for_days floored to total_days (existing clamp) --');
const short = challengeAccess({ ...RUN, open_for_days: 5 }, new Date('2026-09-04T14:00:00Z'));
check('content never cut short', short.days_remaining, 20);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
