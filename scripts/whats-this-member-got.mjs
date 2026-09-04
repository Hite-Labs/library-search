// Print a member's ACTIVE plan connections, so you can see the real plan ids they hold.
//
// Memberstack's dashboard doesn't show plan ids on the member page, which makes
// "does the id in our config match what buyers actually hold?" surprisingly hard to answer.
// This asks the Admin API the same question the portal asks on every request.
//
// READ ONLY. It never attaches, detaches or edits anything.
//
//   node scripts/whats-this-member-got.mjs someone@example.com
//
// Reads MEMBERSTACK_SECRET_KEY from .env.local.

import { readFileSync } from 'node:fs';
import memberstackAdmin from '@memberstack/admin';

// Minimal .env.local reader — this runs outside Next, so lib/env.ts isn't loaded.
function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // Fall through to whatever is already in the environment.
  }
}
loadEnv();

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/whats-this-member-got.mjs <email>');
  process.exit(1);
}

const key = process.env.MEMBERSTACK_SECRET_KEY;
if (!key) {
  console.error('MEMBERSTACK_SECRET_KEY is not set (looked in .env.local).');
  process.exit(1);
}

// What our code currently believes each plan is. Printed alongside the member's real
// connections so a mismatch is obvious rather than something you have to eyeball.
const CONFIGURED = {
  individual: process.env.MEMBERSTACK_INDIVIDUAL_PLAN_ID,
  cohort: process.env.MEMBERSTACK_COHORT_PLAN_ID,
  challenge: process.env.MEMBERSTACK_CHALLENGE_PLAN_ID,
  membership: process.env.MEMBERSTACK_MEMBERSHIP_PLAN_ID,
};

const ms = memberstackAdmin.init(key);

const res = await ms.members.retrieve({ email }).catch((err) => {
  console.error(`Could not read ${email}: ${err}`);
  process.exit(1);
});

const member = res?.data;
if (!member) {
  console.error(`No Memberstack member found for ${email}`);
  process.exit(1);
}

console.log(`\nMember: ${member.auth?.email ?? email}`);
console.log(`Id:     ${member.id}\n`);

const conns = Array.isArray(member.planConnections) ? member.planConnections : [];
if (conns.length === 0) {
  console.log('This member holds NO plan connections at all.\n');
} else {
  console.log('Plan connections (what they actually hold):');
  for (const c of conns) {
    if (!c || typeof c === 'string') {
      console.log(`  - ${String(c)}  (bare id, no status — our code skips these)`);
      continue;
    }
    // Same liveness test as activePlanIdsOf() in lib/memberstack.ts.
    const live = c.active && !/cancel|expired/i.test(c.status ?? '');
    const match = Object.entries(CONFIGURED).find(([, id]) => id && id === c.planId);
    console.log(
      `  - ${c.planId}` +
        `\n      active=${c.active} status=${c.status ?? '(none)'}` +
        `\n      counts as held: ${live ? 'YES' : 'no'}` +
        `\n      matches our config: ${match ? match[0].toUpperCase() : 'NOTHING — this is the bug'}`,
    );
  }
  console.log('');
}

console.log('What our config expects:');
for (const [k, v] of Object.entries(CONFIGURED)) {
  console.log(`  ${k.padEnd(11)} ${v || '(not set)'}`);
}
console.log('');
