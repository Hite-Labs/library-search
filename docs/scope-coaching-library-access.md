# Scope: library access for individual coaching clients

Status: built 2026-10-14. Code: `lib/library-access.ts`; migration: `db/library-access.sql`.

## What we're building

Individual coaching clients get the audio library free while they're being coached, and for
**30 days after their last logged session**. When that runs out, the library page shows them a
**different sales pitch** for a while instead of the normal one. If they come back and log a
session, access comes back by itself.

The library access comes from a new free Memberstack plan:
`pln_membership-included-34f09b7` (the "membership included" plan).

## Decisions (from Lindsay's operator, 2026-10-14)

| Question | Answer |
|---|---|
| Who gets it | Individual coaching clients only, not cohort |
| What starts the 30 days | The last logged session. If nothing new is logged, access ends 30 days later, whether or not the coaching is marked complete |
| Who counts as existing | Clients whose individual coaching is active or paused right now. Clients who already finished get nothing, even if they finished recently |
| The number | 30, one number for everyone, changeable in the dashboard |
| Lapsed | A different version of the sales pitch, not permanent. Coming back to coaching resets it |
| Someone who also pays for SYS Society | The paid plan wins. We never touch it |

## The rule

> access ends = (the later of: last logged individual session, the date we granted access) + N days

- **N** is the dashboard setting, default 30.
- **The date we granted access** covers two cases:
  - A brand-new client with no sessions logged yet gets 30 days from signing up. Their first logged session then pushes the date out.
  - An existing client in the one-off grant whose last session was more than 30 days ago gets 30 days from the grant day. Without this they would lose access the next morning.
- **Logging a session** for someone whose access had ended gives the plan back and resets the clock.
- **Paused clients** follow the same rule. A pause longer than 30 days with no session ends access, and the next logged session restores it.

## What changes

### Database (one hand-run migration, `db/library-access.sql`)
- New table `app_settings (key text primary key, value jsonb, updated_at)`.
  - Holds `coaching_library_days = 30`.
  - Also holds the daily job's "last ran" stamp.
- Two new columns on `clients`:
  - `library_access_granted_at timestamptz`: when we last gave the plan.
  - `library_access_ended_at timestamptz`: when the daily job took it away. It is cleared when access is given back.

### Memberstack
- New env var: `MEMBERSTACK_MEMBERSHIP_INCLUDED_PLAN_ID=pln_membership-included-34f09b7`.
- **Read side.** `planIdsFor('membership')` in `lib/memberstack.ts` counts the included plan as the membership. This is the same trick the free challenge twin already uses. Everything that asks "do they have the library" then says yes with no other changes.
- **Write side.** A dedicated helper attaches and detaches only the included plan. The paid `membership` key stays non-attachable (`isPlanAttachable`), so nobody can accidentally hand out the paid plan.

### Granting
- **New individual client.** This covers the dashboard form and the GHL intake: `createClientWithEnrollment` and adding an individual enrollment to an existing client. Both attach the included plan and stamp `library_access_granted_at`.
- **Session logged.** `addSessionLog` (`lib/db.ts`) re-attaches the plan if the client's access had ended, and clears `library_access_ended_at`.
- **One-off for existing clients.** A button on the Access page (`/reconcile`): "Give library access to current coaching clients".
  - It lists everyone with an active or paused individual enrollment who doesn't hold the plan.
  - You confirm, then it attaches the plan to each person.

### Removing (daily)
- `/api/jobs/tick` already runs every minute. It gains a step that runs at most once a day.
- The step finds clients who have `library_access_granted_at`, have no `library_access_ended_at`, and whose end date has passed.
- For each one, it detaches the included plan and stamps `library_access_ended_at`.
- It never touches the paid SYS Society plan.

### Lapsed message
- `/api/portal` adds `library_access: 'member' | 'lapsed' | 'none'`.
  - `lapsed` means they don't hold the membership and their coaching access ended within the last N days.
  - After that they're back to `none`, the normal pitch.
- `public/embed.js` handles the library page:
  - If the answer is `lapsed` and the page has an element with id `library-lapsed`, it shows that instead of `library-upsell`.
  - If that element doesn't exist, it falls back to the normal pitch, so nothing breaks before the Webflow block is built.
  - The local fallback check also accepts the included plan id.
- `public/portal.js` PLANS registry: the membership entry also accepts the included plan id.
- **Webflow (you):** build one `#library-lapsed` block, styled however you like, marked hidden, next to `#library-upsell`.

### Dashboard
- **Access page:**
  - "Coaching library access: [30] days after last session" setting.
  - The one-off grant button.
- **Client page,** for individual clients, a line that says one of:
  - "Library access until Nov 13 (30 days after last session)"
  - "Library access ended Oct 1"

## Side effect to know about
Because the included plan counts as the membership, a promo set to "hide if they have
membership" (the SYS Society offer) is hidden from coaching clients while their access runs.
It comes back once the access ends.

## Not in scope
- Cohort clients.
- An "ending soon" warning. It's easy to add later on top of `library_access`.
- Per-client overrides of the 30 days.
- Showing the included plan in `/reconcile`'s drift check.

## Deploy order
1. Run `db/library-access.sql` on Neon.
2. Add the env var on the droplet.
3. Push. It auto-deploys.
4. Click the one-off grant on the Access page.
5. Build `#library-lapsed` in Webflow whenever convenient. Until it exists, lapsed people see the normal pitch.

## How to check it
- Create a test individual client. They get the included plan in Memberstack, and the library page shows the library.
- Set their access to have ended, for example by temporarily setting N to 0 and letting the daily step run. The plan is removed and the library page shows `#library-lapsed`.
- Log a session for them. The plan is back and the library shows again.
- A SYS Society payer who is also a coaching client keeps the library throughout.
