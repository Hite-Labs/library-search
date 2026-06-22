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

  UPLOAD_TOOL_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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
