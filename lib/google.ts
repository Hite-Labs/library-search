import { env } from './env';

/**
 * Just enough Google Drive + Docs for intake (CC-4), over plain fetch.
 *
 * Not the `googleapis` package: it is enormous, and the droplet (1GB) already runs out of
 * memory during builds. Four REST calls don't need it.
 *
 * Auth is OAuth as Lindsay, through an Internal Workspace app: a long-lived refresh token
 * (obtained once with scripts/google-auth.mjs) is exchanged for short-lived access tokens.
 * Files are therefore created in and owned by her Drive, exactly as if she'd made them.
 */

export class GoogleError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GoogleError';
  }
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN);
}

let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;
  if (!res.ok || !body?.access_token) {
    // invalid_grant = the refresh token was revoked or expired; only re-authorising fixes it.
    throw new GoogleError(
      `Google token refresh failed: ${body?.error_description ?? body?.error ?? `HTTP ${res.status}`}`,
      res.status,
    );
  }
  cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function call<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      message = JSON.parse(text)?.error?.message ?? text;
    } catch {
      // not JSON; keep the raw text
    }
    throw new GoogleError(`Google ${res.status}: ${message.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
// Shared-drive safe: harmless on My Drive, required if the Clients folder is on a shared drive.
const ALL_DRIVES = 'supportsAllDrives=true';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

export function docUrl(id: string): string {
  return `https://docs.google.com/document/d/${id}/edit`;
}

export async function createFolder(
  name: string,
  parentId: string,
  appProperties: Record<string, string>,
): Promise<DriveFile> {
  return call<DriveFile>(`${DRIVE}?${ALL_DRIVES}&fields=id,name,mimeType`, {
    method: 'POST',
    body: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId], appProperties },
  });
}

export async function copyFile(
  fileId: string,
  name: string,
  parentId: string,
  appProperties: Record<string, string>,
): Promise<DriveFile> {
  return call<DriveFile>(`${DRIVE}/${fileId}/copy?${ALL_DRIVES}&fields=id,name,mimeType`, {
    method: 'POST',
    body: { name, parents: [parentId], appProperties },
  });
}

/**
 * Find files this app tagged with a private property — how a step recovers the folder it
 * created if the process died before the id was saved, instead of making a second one.
 */
export async function findByAppProperty(key: string, value: string): Promise<DriveFile[]> {
  const q = `appProperties has { key='${key}' and value='${value.replace(/'/g, "\\'")}' } and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const out = await call<{ files: DriveFile[] }>(`${DRIVE}?${params}`);
  return out.files ?? [];
}

export async function trashFile(fileId: string): Promise<void> {
  await call(`${DRIVE}/${fileId}?${ALL_DRIVES}&fields=id`, { method: 'PATCH', body: { trashed: true } });
}

/**
 * Replace placeholder text throughout a Doc. With no `tabsCriteria`, `replaceAllText`
 * applies to every tab, which is what the multi-tab notes template needs.
 */
export async function replaceAllText(docId: string, replacements: Record<string, string>): Promise<void> {
  const requests = Object.entries(replacements).map(([text, replaceText]) => ({
    replaceAllText: { containsText: { text, matchCase: true }, replaceText },
  }));
  if (requests.length === 0) return;
  await call(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: 'POST',
    body: { requests },
  });
}
