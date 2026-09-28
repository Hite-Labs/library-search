import { z } from 'zod';

// A blank `NAME=` line in .env.local reads as '' — treat that as unset, not as a value that
// fails validation and stops the whole app booting. Used by the intake vars below, which ship
// blank in .env.example.
const blankToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = (min = 0) => z.preprocess(blankToUndefined, z.string().min(min).optional());

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL_BASE: z.string().url(),

  NEON_DATABASE_URL: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),

  // Memberstack 2.0 Admin API (server-side only). sk_… = live, sk_sb_… = test.
  // Optional so the app boots without it — Memberstack features (provisioning,
  // cohort-aware search, JWT verify) simply no-op/degrade when it's absent.
  MEMBERSTACK_SECRET_KEY: z.string().min(1).optional(),
  // Optional: your Memberstack app id (app_…) → enables verifyToken audience checks.
  NEXT_PUBLIC_MEMBERSTACK_APP_ID: z.string().optional(),
  // Optional: Memberstack public/DOM key (pk_… live, pk_sb_… test). Used in the browser
  // to send the "set your password" email on client create. Distinct from the app id
  // above. Optional → a missing key silently disables the welcome-email step.
  NEXT_PUBLIC_MEMBERSTACK_PUBLIC_KEY: z.string().optional(),
  // Optional: the FREE Memberstack plan id (pln_…) to attach to every newly-provisioned
  // client (the "individual" plan). Dashboard → Plans → the plan → copy its id. Only free
  // plans (pln_) can be attached on create. Unset → no plan attached.
  MEMBERSTACK_INDIVIDUAL_PLAN_ID: z.string().optional(),
  // Optional: the FREE Memberstack plan id for cohort members. The portal script gates
  // its cohort panel on this plan (see public/portal.js), so a cohort-only person needs
  // it to see anything but the upsell. Unset → no plan attached for cohort members.
  MEMBERSTACK_COHORT_PLAN_ID: z.string().optional(),
  // Optional: the FREE Memberstack plan id for the 21-day challenge. This plan is what
  // grants challenge access, whichever way it was obtained — bought directly, bundled with
  // the audio membership, or added to an existing coaching client. There is no roster:
  // holding this plan IS the enrolment, so a Memberstack automation has to attach it on
  // every purchase route. Unset → nobody sees the challenge.
  MEMBERSTACK_CHALLENGE_PLAN_ID: z.string().optional(),
  // Optional: the Memberstack plan id for SYS Society, the audio membership. Unlike the
  // coaching plans there is no enrolment behind it — the member buys it themselves and
  // holding it IS the entitlement. Unset → the audio-membership offer shows to everyone,
  // including people who already bought it, which is the failure this id prevents.
  MEMBERSTACK_MEMBERSHIP_PLAN_ID: z.string().optional(),
  // Optional: the FREE "challenge included" plan id (pln_…). The paid challenge plan cannot
  // be attached by anything but a purchase — Memberstack answers `plan-not-free` — so this
  // free twin is what the audio membership grants instead, automatically, as part of buying
  // SYS Society. Holding EITHER plan is challenge access; see planIdsFor.
  // Unset → only the paid plan grants the challenge, and the bundle silently does nothing.
  MEMBERSTACK_CHALLENGE_INCLUDED_PLAN_ID: z.string().optional(),

  UPLOAD_TOOL_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  // Webflow passwordless login page. Powers the per-client "Copy login link" button
  // (link is suffixed with ?email=… to pre-fill the client's email) and the unsuffixed
  // version on the cohort roster, which is safe to paste in a group chat. Optional →
  // button hides when unset.
  NEXT_PUBLIC_PORTAL_LOGIN_URL: z.string().url().optional(),
  // The portal itself — where members who already have an account should return. Distinct
  // from the login page above, which clears any existing Memberstack session on load: a
  // member who bookmarks the login URL is asked for a fresh code on every visit, while
  // the portal URL lands them straight in (the _ms-mid cookie outlives a browser restart).
  // Optional → button hides when unset.
  NEXT_PUBLIC_PORTAL_URL: z.string().url().optional(),
  // Global booking link, used wherever a client has no per-enrollment calendar_url of their
  // own: the "copy booking link" button on the client view, and the portal's schedule CTA
  // (/api/portal returns it as client.calendar_url when the enrollment's is blank).
  // Optional → the portal falls back to whatever href Webflow authored on the button.
  NEXT_PUBLIC_BOOKING_URL: z.string().url().optional(),

  // ── Coaching intake automation (see docs/intake-setup.md) ──
  // Every one of these is optional so the app boots without them. A setup step whose
  // integration is unset parks as `blocked` with "not configured: X" on /attention rather
  // than failing silently, and the intake endpoint refuses everything while its secret is unset.
  //
  // Shared secret GHL sends as the X-Intake-Secret header on POST /api/intake.
  INTAKE_SECRET: optionalString(16),
  // Shared secret the droplet crontab sends as X-Cron-Secret on POST /api/jobs/tick.
  CRON_SECRET: optionalString(16),
  // Session count for the individual pack an intake creates. Unset → 6, the schema default.
  INTAKE_DEFAULT_SESSIONS: z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional()),
  // Google OAuth (an Internal Workspace app, authorised once as Lindsay). Drive + Docs scopes.
  GOOGLE_CLIENT_ID: optionalString(),
  GOOGLE_CLIENT_SECRET: optionalString(),
  GOOGLE_REFRESH_TOKEN: optionalString(),
  // The Drive folder each client's folder is created inside.
  GOOGLE_CLIENTS_FOLDER_ID: optionalString(),
  // The master "Coaching Notes" Google Doc copied for every client.
  GOOGLE_NOTES_TEMPLATE_DOC_ID: optionalString(),
  // Link to a contact in GHL, with {id} where the contact id goes, e.g.
  // https://app.gohighlevel.com/v2/location/<loc>/contacts/detail/{id}
  GHL_CONTACT_URL_TEMPLATE: optionalString(),
  // Telegram bot that renames pool groups, makes invite links, and pings Lindsay.
  TELEGRAM_BOT_TOKEN: optionalString(),
  // Lindsay's chat id with that bot — where notifications go.
  TELEGRAM_LINDSAY_CHAT_ID: optionalString(),
  // The Claude Code routine that drafts the intro email. Unset → that step is skipped.
  CLAUDE_ROUTINE_ID: optionalString(),
  CLAUDE_ROUTINE_TOKEN: optionalString(),
});

type Env = z.infer<typeof envSchema>;

function getEnv(): Env {
  // Skip validation during Next.js build-time static analysis
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return process.env as unknown as Env;
  }
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return result.data;
}

export const env = getEnv();
