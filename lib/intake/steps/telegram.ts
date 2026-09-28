import { getClientById } from '../../db';
import { notifyLindsay } from '../../notify';
import {
  createChatInviteLink,
  isTelegramConfigured,
  setChatTitle,
  TelegramError,
} from '../../telegram';
import {
  claimSpace,
  countAvailableSpaces,
  getSpaceForClient,
  LOW_POOL_THRESHOLD,
  setSpaceInviteLink,
} from '../../telegram-spaces';
import { BlockedError, notConfigured, PermanentError, TransientError } from '../errors';
import type { StepHandler } from '../runner';

/**
 * CC-5 — give the client their own private Telegram group and a one-person invite link.
 *
 * The claim is the side effect that must not repeat, so a client who already holds a group
 * keeps it: a retry only finishes whatever is missing (the title, the link).
 */
export const telegramStep: StepHandler = async ({ event, prior, step, save }) => {
  if (!isTelegramConfigured()) throw notConfigured('TELEGRAM_BOT_TOKEN');

  const clientId = prior.client?.clientId as string | undefined;
  const client = clientId ? await getClientById(clientId) : null;
  if (!client) throw new PermanentError('Client step has no client — retry the Member step first');

  let space = await getSpaceForClient(client.id);
  let claimedNow = false;
  if (!space) {
    space = await claimSpace(client.id);
    if (!space) {
      throw new BlockedError(
        'No Telegram groups left in the pool. Create one with the bot as admin, register it on ' +
          'Needs attention, then retry.',
      );
    }
    claimedNow = true;
  }
  await save({ chatId: space.chat_id });

  const name = [event.first_name, event.last_name].filter(Boolean).join(' ') || client.name;

  try {
    // Only a group claimed by THIS step needs renaming. One the client already held (an
    // earlier intake, a retry) was named then — and Lindsay may have renamed it since.
    if (!step.result.titled && (claimedNow || !space.invite_link)) {
      try {
        await setChatTitle(space.chat_id, name);
      } catch (err) {
        // Already has this title (a retry after a crash between rename and checkpoint).
        if (!(err instanceof TelegramError && /not modified/i.test(err.message))) throw err;
      }
      await save({ titled: true });
    }
    let inviteLink = space.invite_link;
    if (!inviteLink) {
      inviteLink = await createChatInviteLink(space.chat_id, name);
      await setSpaceInviteLink(space.chat_id, inviteLink);
    }

    if (claimedNow) {
      const left = await countAvailableSpaces();
      if (left <= LOW_POOL_THRESHOLD) {
        await notifyLindsay(
          `Telegram pool is low: ${left} group${left === 1 ? '' : 's'} left. Make a few more and register them.`,
        );
      }
    }

    return { chatId: space.chat_id, inviteLink, titled: true };
  } catch (err) {
    if (err instanceof TelegramError) {
      // 429 carries Telegram's own wait; 5xx and network trouble are worth another go.
      if (err.status === 429) {
        throw new TransientError(err.message, new Date(Date.now() + (err.retryAfter ?? 30) * 1000));
      }
      if (err.status >= 500 || err.status === 0) throw new TransientError(err.message);
      // 400/403: usually the bot isn't an admin of that group, or lacks a right. A person has
      // to fix the group; retrying won't.
      throw new PermanentError(`${err.message} (is the bot an admin of chat ${space.chat_id}?)`);
    }
    throw err;
  }
};
