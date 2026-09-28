# Coaching intake automation — setup

What happens when a new coaching client submits the GHL intake form, and what has to be
configured for it to work. Stories CC-0 … CC-14.

## How it works

```
GHL workflow webhook ──► POST /api/intake  (X-Intake-Secret)
                           │  stores intake_events row + 5 intake_steps rows, answers 200 at once
                           ▼
                         runner (lib/intake/runner.ts) — started right after the response,
                         and again every minute by the droplet cron (POST /api/jobs/tick)
                           │
   1. client        match-or-create the client + Memberstack member, individual plan
   2. drive         Drive folder "YYYY-MM-DD — First Last" + copy of the Coaching Notes doc
   3. telegram      claim a group from the pool, rename it, one-person invite link
   4. routine       fire the Claude Code routine that drafts the intro email (never sends)
   5. notify_ready  Telegram ping to Lindsay: "New coaching client ready"
```

- Steps run in order. Each one checks what it already did before acting, so a retry — or GHL
  sending the same webhook twice — never makes a second member, folder, group or draft.
- A failing step is retried automatically (after 1 min, then 5 min), then marked **failed**. A
  step that needs a person (empty Telegram pool, missing config) is marked **blocked** at once.
  Either way Lindsay gets a Telegram ping, and **Needs attention** shows it with a Retry button.
- The routine step never retries on its own except on 429/503, because the fire endpoint has
  no idempotency key: a blind retry could draft two intro emails.
- One intake per GHL contact. A repeat from the same contact is ignored — quietly within a
  day (GHL retries, double submits), with a ping to Lindsay after that (probably a returning
  client, whose new pack she adds on their client page).
- One intro-email draft per person: if a second GHL contact turns out to be someone already
  set up, their drafting step is skipped.

## 1. Database

```
node scripts/run-migration.mjs db/intake.sql           # dry run — shows what it adds
node scripts/run-migration.mjs db/intake.sql --apply   # Neon is PRODUCTION
```

**Apply this before deploying the code.** It's harmless under the current app.

Additive only: `intake_events`, `intake_steps`, `telegram_spaces`, `custom_audios`, two nullable
columns on `clients`, and a case-insensitive unique index on `clients.email`.

## 2. Environment variables (droplet `.env.local`, then `pm2 reload`)

| Variable | What it is |
|---|---|
| `INTAKE_SECRET` | Shared secret for the GHL webhook header. `openssl rand -hex 32` |
| `CRON_SECRET` | Shared secret for the cron tick header. `openssl rand -hex 32` (a different one) |
| `INTAKE_DEFAULT_SESSIONS` | Sessions in the pack an intake creates. Optional, default 6 |
| `MEMBERSTACK_INDIVIDUAL_PLAN_ID` | Must be set (`pln_individual-coaching-nkaa080g`) or step 1 blocks |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client (below) |
| `GOOGLE_REFRESH_TOKEN` | From `node scripts/google-auth.mjs`, approved as Lindsay |
| `GOOGLE_CLIENTS_FOLDER_ID` | The Drive folder client folders go in (the id at the end of its URL) |
| `GOOGLE_NOTES_TEMPLATE_DOC_ID` | The master Coaching Notes doc (the id in its URL) |
| `GHL_CONTACT_URL_TEMPLATE` | e.g. `https://app.gohighlevel.com/v2/location/<LOCATION>/contacts/detail/{id}` |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_LINDSAY_CHAT_ID` | Lindsay's chat id with the bot (below) |
| `CLAUDE_ROUTINE_ID`, `CLAUDE_ROUTINE_TOKEN` | The drafting routine. Leave unset until it exists — the step is then skipped |
| `NEXT_PUBLIC_APP_URL` | Already set; used for the deep links in Telegram pings |

None are `NEXT_PUBLIC_` (apart from the existing one), so no rebuild is needed to change them.

## 3. Cron (droplet)

`crontab -e`, add one line (use the real `CRON_SECRET`; `127.0.0.1`, not `localhost`, to avoid
the IPv6 gotcha):

```
* * * * * curl -fsS -m 70 -X POST -H "X-Cron-Secret: PASTE_CRON_SECRET" http://127.0.0.1:3002/api/jobs/tick >/dev/null 2>&1
```

## 4. Google (Drive + Docs as Lindsay)

1. Google Cloud Console, in Lindsay's Workspace: create a project, enable the **Google Drive
   API** and **Google Docs API**.
2. OAuth consent screen: **Internal**.
3. Credentials → OAuth client ID → **Desktop app**. Put the id and secret in `.env.local` on
   your machine.
4. `node scripts/google-auth.mjs`, open the printed URL **signed in as Lindsay**, Allow. Copy the
   printed `GOOGLE_REFRESH_TOKEN` to the droplet.
5. The template doc should contain these placeholders (any tab): `{{client_name}}`, `{{email}}`,
   `{{start_date}}`, `{{ghl_contact_url}}` — the last one in the Intake tab, where Lindsay reads
   the full intake answers in GHL.

## 5. Telegram

1. @BotFather → `/newbot` → `TELEGRAM_BOT_TOKEN`.
2. Lindsay sends the bot any message, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id` →
   `TELEGRAM_LINDSAY_CHAT_ID`.
3. **The pool.** The Bot API can't create groups, so make a few ahead of time. For each:
   create a private group, add the bot, make it an admin with *Change group info* and *Invite
   users via link*. Get the group's chat id (add the bot, send a message in the group, then
   `getUpdates` again — it's the negative number). Paste it into **Needs attention → Telegram
   pool → Add group**; the dashboard checks the bot's rights before accepting it.
4. Keep 3+ spare. Lindsay is pinged when 2 or fewer are left.

## 6. GHL

In the intake workflow, add a **Webhook** action:

- URL: `https://dashboard.showyourspark.com/api/intake`, method POST
- Header: `X-Intake-Secret: <INTAKE_SECRET>`
- Body (custom data):
  ```json
  {
    "type": "new_coaching_client",
    "ghl_contact_id": "{{contact.id}}",
    "first_name": "{{contact.first_name}}",
    "last_name": "{{contact.last_name}}",
    "email": "{{contact.email}}"
  }
  ```

Intake answers are deliberately not sent; they stay in GHL, linked from the notes doc.

## 7. Before the first real intake

- **Access → Import members** once, so everyone who bought the challenge or membership on the
  site is in Clients (CC-0). Intake would still find them in Memberstack by email, but the
  dashboard should show them.
- Run the end-to-end check with an email you own, then clean up:
  ```
  node scripts/intake-e2e.mjs --email you+intake@example.com --base https://dashboard.showyourspark.com
  node scripts/intake-e2e.mjs --email you+intake@example.com --cleanup
  ```

## Custom audio (no webhook)

GHL notifies Lindsay of a purchase. She opens **Needs attention → Custom audio**, finds the
buyer (import them on **Access** first if they bought on the site and aren't in Clients yet),
creates the delivery, uploads the file, and presses **Mark delivered**. It then appears in
their portal (`custom_audios` in `/api/portal`; Webflow fields `custom-audio*`, see
`docs/portal-field-reference.md`). There is no email yet: the client page shows a ready-to-copy
"your audio is ready" message.
