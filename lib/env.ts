import { z } from 'zod';

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_PUBLIC_URL_BASE: z.string().url(),

  WEBFLOW_API_KEY: z.string().min(1),
  WEBFLOW_COLLECTION_ID: z.string().min(1),

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
