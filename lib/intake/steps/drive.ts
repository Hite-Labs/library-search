import { getClientById, setClientDriveIds } from '../../db';
import { env } from '../../env';
import {
  copyFile,
  createFolder,
  findByAppProperty,
  GoogleError,
  isGoogleConfigured,
  replaceAllText,
} from '../../google';
import { notConfigured, PermanentError, TransientError } from '../errors';
import type { StepHandler } from '../runner';

/**
 * CC-4 — the client's Drive folder and their copy of the Coaching Notes template.
 *
 * Idempotent at every stage, because each stage has a side effect that must not repeat:
 *   1. The ids on the client row win — if they're set, there's nothing to do.
 *   2. Otherwise look for a folder/doc this step already created, by the private
 *      `intakeClientId` property stamped on it. That covers dying after Google created the
 *      file but before its id was saved.
 *   3. Only then create.
 * The placeholder fill is safe to repeat: once replaced, the placeholders are gone.
 */
export const driveStep: StepHandler = async ({ event, prior, save, step }) => {
  if (!isGoogleConfigured()) {
    throw notConfigured('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN');
  }
  const parentId = env.GOOGLE_CLIENTS_FOLDER_ID;
  const templateId = env.GOOGLE_NOTES_TEMPLATE_DOC_ID;
  if (!parentId) throw notConfigured('GOOGLE_CLIENTS_FOLDER_ID');
  if (!templateId) throw notConfigured('GOOGLE_NOTES_TEMPLATE_DOC_ID');

  const clientId = prior.client?.clientId as string | undefined;
  const client = clientId ? await getClientById(clientId) : null;
  if (!client) throw new PermanentError('Client step has no client — retry the Member step first');

  const name = [event.first_name, event.last_name].filter(Boolean).join(' ') || client.name;

  try {
    // 1–2. Folder.
    let folderId = client.drive_folder_id;
    if (!folderId) {
      const found = await findByAppProperty('intakeClientId', client.id);
      folderId =
        found.find((f) => f.mimeType === 'application/vnd.google-apps.folder')?.id ??
        (await createFolder(`${todayInNewYork()} — ${name}`, parentId, {
          intakeClientId: client.id,
        })).id;
      await setClientDriveIds(client.id, { folderId });
      await save({ folderId });
    }

    // Notes doc.
    let docId = client.notes_doc_id;
    if (!docId) {
      const found = await findByAppProperty('intakeClientId', client.id);
      docId =
        found.find((f) => f.mimeType === 'application/vnd.google-apps.document')?.id ??
        (await copyFile(templateId, `${name} — Coaching Notes`, folderId, {
          intakeClientId: client.id,
        })).id;
      await setClientDriveIds(client.id, { docId });
      await save({ docId });
    }

    if (!step.result.filled) {
      await replaceAllText(docId, {
        '{{client_name}}': name,
        '{{email}}': client.email,
        '{{start_date}}': todayInNewYork(),
        '{{ghl_contact_url}}': ghlContactUrl(event.ghl_contact_id) ?? '(no GHL link)',
      });
    }

    return { folderId, docId, filled: true };
  } catch (err) {
    throw classify(err);
  }
};

/** Dated folder names sort by start date; New York because that's Lindsay's calendar. */
function todayInNewYork(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export function ghlContactUrl(contactId: string | null): string | null {
  const template = env.GHL_CONTACT_URL_TEMPLATE;
  if (!template || !contactId) return null;
  return template.replace('{id}', encodeURIComponent(contactId));
}

/** Google's rate limits and outages are worth retrying; a wrong id or revoked access isn't. */
function classify(err: unknown): Error {
  if (!(err instanceof GoogleError)) return err instanceof Error ? err : new Error(String(err));
  const rateLimited = err.status === 403 && /rate limit/i.test(err.message);
  if (err.status === 429 || err.status >= 500 || rateLimited) return new TransientError(err.message);
  return new PermanentError(err.message);
}
