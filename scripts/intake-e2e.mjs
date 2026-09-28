// End-to-end check of the coaching intake automation (CC-10).
//
//     node scripts/intake-e2e.mjs --email you+intake-test@example.com
//     node scripts/intake-e2e.mjs --email you+intake-test@example.com --base https://dashboard.showyourspark.com
//     node scripts/intake-e2e.mjs --email you+intake-test@example.com --cleanup
//
// Sends real webhooks to a running app and reads the results back from Neon. Neon is shared
// with production, and a run does real things: it creates a Memberstack member, a Drive
// folder, and claims a Telegram group. Use an email you own and nobody else's, and run
// --cleanup afterwards.
//
// What it checks:
//   1. A bad secret gets 401.
//   2. A payload without an email is stored as `invalid`.
//   3. A good payload is accepted; the same payload again is a no-op (dedupe).
//   4. Every step reaches `done` (it calls the cron tick itself while waiting).
//   5. Exactly one client, one Drive folder id, one Telegram group, one routine session.
//   6. A third identical POST changes nothing.
//
// --cleanup deletes the test intake events and the client row, hands the Telegram group back
// to the pool, and trashes the Drive folder. It does NOT delete the Memberstack member —
// remove that in Memberstack if you want the email free again.
//
// Reads NEON_DATABASE_URL, INTAKE_SECRET, CRON_SECRET (and the GOOGLE_* vars for cleanup)
// from .env.local, like the other scripts here.

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const base = (arg('base', 'http://localhost:3000') ?? '').replace(/\/$/, '');
const email = arg('email')?.trim().toLowerCase();
const contactId = arg('contact', `e2e-${email}`);
const firstName = arg('first', 'Intake');
const lastName = arg('last', 'Test');
const cleanup = process.argv.includes('--cleanup');

if (!email) {
  console.error('Usage: node scripts/intake-e2e.mjs --email <test email you own> [--base URL] [--cleanup]');
  process.exit(1);
}
for (const v of ['NEON_DATABASE_URL', 'INTAKE_SECRET', 'CRON_SECRET']) {
  if (!process.env[v]) {
    console.error(`${v} is not set (looked in .env.local and the environment).`);
    process.exit(1);
  }
}

const sql = neon(process.env.NEON_DATABASE_URL);
let failures = 0;
function check(ok, label, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function postIntake(body, secret = process.env.INTAKE_SECRET) {
  const res = await fetch(`${base}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Intake-Secret': secret },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function tick() {
  await fetch(`${base}/api/jobs/tick`, {
    method: 'POST',
    headers: { 'X-Cron-Secret': process.env.CRON_SECRET },
  }).catch(() => {});
}

async function snapshot() {
  const [counts] = await sql`
    SELECT
      (SELECT count(*)::int FROM clients WHERE lower(email) = ${email}) AS clients,
      (SELECT count(*)::int FROM intake_events WHERE ghl_contact_id = ${contactId} AND status <> 'invalid') AS events,
      (SELECT count(*)::int FROM intake_steps s JOIN intake_events e ON e.id = s.event_id
         WHERE e.ghl_contact_id = ${contactId}) AS steps,
      (SELECT count(*)::int FROM telegram_spaces t JOIN clients c ON c.id = t.client_id
         WHERE lower(c.email) = ${email}) AS spaces,
      (SELECT count(*)::int FROM enrollments en JOIN clients c ON c.id = en.client_id
         WHERE lower(c.email) = ${email} AND en.program_type = 'individual') AS packs`;
  return counts;
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

async function googleToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  return (await res.json()).access_token ?? null;
}

if (cleanup) {
  console.log(`\nCleaning up test intake for ${email} (contact ${contactId})\n`);
  const [client] = await sql`SELECT * FROM clients WHERE lower(email) = ${email}`;
  if (client?.drive_folder_id) {
    const token = await googleToken();
    if (token) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${client.drive_folder_id}?supportsAllDrives=true`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        },
      );
      console.log(`  Drive folder ${res.ok ? 'trashed' : `NOT trashed (HTTP ${res.status})`}`);
    } else {
      console.log('  Drive folder left in place (GOOGLE_* not set here) — trash it by hand.');
    }
  }
  if (client) {
    await sql`
      UPDATE telegram_spaces
      SET status = 'available', client_id = NULL, invite_link = NULL, assigned_at = NULL
      WHERE client_id = ${client.id}`;
    console.log(
      '  Telegram group returned to the pool. If you joined it with the test link, leave the ' +
        'group first — otherwise the next real client would share it with you.',
    );
  }
  const events = await sql`DELETE FROM intake_events WHERE ghl_contact_id IN (${contactId}, ${contactId + '-noemail'}) OR lower(email) = ${email} RETURNING id`;
  console.log(`  Deleted ${events.length} intake event(s).`);
  if (client) {
    await sql`DELETE FROM clients WHERE id = ${client.id}`;
    console.log(`  Deleted client ${client.id}. The Memberstack member ${client.memberstack_id ?? '(none)'} was kept.`);
  }
  console.log('');
  process.exit(0);
}

// ── Run ──────────────────────────────────────────────────────────────────────

const payload = {
  type: 'new_coaching_client',
  ghl_contact_id: contactId,
  first_name: firstName,
  last_name: lastName,
  email,
};

console.log(`\nIntake E2E against ${base} for ${email}\n`);

const bad = await postIntake(payload, 'definitely-not-the-secret');
check(bad.status === 401, 'bad secret is refused', `HTTP ${bad.status}`);

const invalid = await postIntake({ ...payload, ghl_contact_id: `${contactId}-noemail`, email: '' });
const [invalidRow] = invalid.body?.id
  ? await sql`SELECT status FROM intake_events WHERE id = ${invalid.body.id}`
  : [];
check(invalid.status === 200 && invalidRow?.status === 'invalid', 'missing email is stored as invalid');

const first = await postIntake(payload);
const second = await postIntake(payload);
check(first.status === 200 && ['received', 'duplicate'].includes(first.body?.status), 'first POST accepted', first.body?.status);
check(second.body?.status === 'duplicate', 'second POST is a duplicate', second.body?.status);

console.log('\n  waiting for setup (ticking the runner)…');
let steps = [];
for (let i = 0; i < 40; i++) {
  steps = await sql`
    SELECT s.step, s.status, s.last_error, s.result FROM intake_steps s
    JOIN intake_events e ON e.id = s.event_id
    WHERE e.ghl_contact_id = ${contactId} ORDER BY s.seq`;
  if (steps.length && steps.every((s) => ['done', 'failed', 'blocked'].includes(s.status))) break;
  await tick();
  await new Promise((r) => setTimeout(r, 3000));
}
for (const s of steps) {
  check(s.status === 'done', `step ${s.step}`, s.status === 'done' ? '' : `${s.status}: ${s.last_error ?? ''}`);
}

const snap1 = await snapshot();
check(snap1.clients === 1, 'exactly one client', String(snap1.clients));
check(snap1.events === 1, 'exactly one intake event', String(snap1.events));
check(snap1.steps === 5, 'exactly five steps', String(snap1.steps));
check(snap1.spaces <= 1, 'at most one Telegram group', String(snap1.spaces));
check(snap1.packs === 1, 'exactly one individual pack', String(snap1.packs));

const [client] = await sql`SELECT * FROM clients WHERE lower(email) = ${email}`;
check(Boolean(client?.memberstack_id), 'client linked to a Memberstack member');
check(Boolean(client?.drive_folder_id && client?.notes_doc_id), 'Drive folder and notes doc recorded');
const routine = steps.find((s) => s.step === 'routine');
check(
  Boolean(routine?.result?.sessionUrl || routine?.result?.skipped),
  'routine fired (or skipped: not configured)',
  routine?.result?.skipped ? 'skipped' : routine?.result?.sessionUrl ?? '',
);

const third = await postIntake(payload);
await tick();
const snap2 = await snapshot();
check(third.body?.status === 'duplicate', 'third POST is a duplicate', third.body?.status);
check(JSON.stringify(snap1) === JSON.stringify(snap2), 'nothing changed after the re-send');

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
console.log(`Clean up with: node scripts/intake-e2e.mjs --email ${email} --cleanup\n`);
process.exit(failures === 0 ? 0 : 1);
