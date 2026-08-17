# Guild Boss Planner Bot

A Discord bot that organizes guild boss attack slots (2x/day) across 4
classes — **Sage** (healer), **Chevalier** (tank), **Sorcier** (DPS) and
**Duelliste** (DPS) — handling different player timezones and healer
availability automatically.

## How it works

There are only **two commands**:

- `/setup` (admin only) — configure the bot once: which Discord role
  corresponds to each class, and which channels to use, through Discord's
  own role/channel picker menus.
- `/conquest` — everyone's single entry point. It always shows the same
  planning list (every slot that has a Sage available, with the class logo
  of every player signed up, and your own slots marked 🟢 so you can spot
  them instantly), and adapts what's below it to your class:
  - **Sage**: gets the availability menus (same as the old
    `/healer-availability`) to create up to **2 slots/day**. Sages don't get
    a sign-up menu, since it's their own slots — the 🟢 markers already show
    which ones they made available.
  - **Everyone else** (Chevalier, Sorcier, Duelliste): gets the sign-up menu
    to pick up to **2 existing slots/day**.

On top of that:
- A reminder is posted automatically a few minutes before each slot that
  has signups.
- When a slot **starts**, the bot posts an "I'm ready!" button so
  participants can mark themselves present, with their class logo shown
  next to their name.
- If a Sage removes their last availability on a slot that already has
  players signed up, those signups are cancelled automatically and the
  affected players are notified.

All times are stored in UTC and shown automatically in each player's local
timezone thanks to Discord's dynamic timestamps — nobody needs to configure
anything.

Class logos are picked up automatically from your server's own role icons
(Server Settings > Roles > click a role > the emoji/icon picker at the top)
if you've set one — no extra configuration needed. Roles without a custom
icon fall back to a sensible default (🧙 🛡️ 🪄 🤺).

---

## Installation guide (step by step)

You don't need to know how to code to follow this — just copy/paste.

### Step 1 — Create the bot on Discord's Developer Portal

1. Go to https://discord.com/developers/applications and log in with your
   Discord account.
2. Click **New Application**, give it a name (e.g. "Boss Planner"), accept
   the terms, and click **Create**.
3. In the left sidebar, click **Bot**.
   - Click **Reset Token**, confirm, then **copy the token** that appears.
     ⚠️ Keep this secret — anyone with it can control your bot. You'll paste
     it into the `.env` file in Step 3.
   - Scroll down to **Privileged Gateway Intents** and enable
     **Server Members Intent**. Save changes.
4. In the left sidebar, click **General Information** and copy the
   **Application ID** — you'll need it as `CLIENT_ID`.

### Step 2 — Invite the bot to your server

1. Still in the Developer Portal, click **OAuth2** in the sidebar, then
   **URL Generator**.
2. Under **Scopes**, check `bot` and `applications.commands`.
3. Under **Bot Permissions**, check: `Send Messages`, `Embed Links`,
   `Use Slash Commands`, `Read Message History`, `Mention Everyone` (needed
   so class/player pings actually notify people).
4. Copy the generated URL at the bottom, paste it into your browser, pick
   your Discord server, and click **Authorize**.

### Step 3 — Install and configure the bot

You'll need [Node.js](https://nodejs.org/) installed on the machine that
will run the bot (version 18 or newer). Download and install it if you
haven't already — just click through the installer with default options.

1. Unzip this project folder somewhere on your computer.
2. Open a terminal (Command Prompt / PowerShell on Windows, Terminal on
   Mac) inside that folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to a new file named `.env` in the same folder.
5. Enable **Developer Mode** in Discord (Settings gear icon > Advanced >
   toggle **Developer Mode** on), then right-click your **server icon** >
   **Copy Server ID**.
6. Open `.env` in a text editor and fill in the 3 values:
   ```
   DISCORD_TOKEN=your_bot_token_from_step_1
   CLIENT_ID=your_application_id_from_step_1
   GUILD_ID=your_server_id_from_step_5
   NOTIFY_MINUTES_BEFORE=10
   ```
   That's it — no role or channel IDs to copy here, that's all done inside
   Discord in Step 5 below.

### Step 4 — Register the slash commands

Still in the terminal, in the project folder, run:
```bash
npm run deploy
```
You should see `✅ Commands deployed successfully to the server.`. You only
need to re-run this if you later change a command's name/description/options.

### Step 5 — Start the bot

```bash
npm start
```
You should see `✅ Logged in as YourBotName#0000`. The bot is now online!

Keep the terminal window open — closing it stops the bot. See
**"Keeping it running 24/7"** below for a way to leave it running without
keeping your computer on.

### Step 6 — Run `/setup` on your server

Before the bot can do anything useful, an admin needs to configure it once,
directly on Discord:

1. Make sure your 4 class roles (e.g. **Sage**, **Chevalier**, **Sorcier**,
   **Duelliste**) already exist on your server (Server Settings > Roles),
   and that members have been assigned to them.
2. Pick or create a text channel for boss-attack alerts, e.g.
   `#guild-boss`. Make sure the bot can see and post in it.
3. In your server, type `/setup` (only members with the **Manage Server**
   permission can run this — Discord hides the command from everyone else
   automatically).
4. **Step 1/2** shows a dropdown for each class:
   ```
   ⚙️ Guild Boss Bot Setup — Step 1/2: Class roles

   🧙 Sage role      [ ▼ Select a role ]
   🛡️ Chevalier role [ ▼ Select a role ]
   🪄 Sorcier role   [ ▼ Select a role ]
   🤺 Duelliste role [ ▼ Select a role ]

                              [ Next ▶ ]
   ```
   Pick the matching Discord role in each dropdown, then click **Next ▶**.
5. **Step 2/2** shows the channel pickers:
   ```
   ⚙️ Guild Boss Bot Setup — Step 2/2: Channels

   🔔 Notification channel      [ ▼ #guild-boss ]
   ✅ Ready-check channel (opt) [ ▼ #guild-boss ]

                    [ ◀ Back ]  [ 💾 Save ]
   ```
   Pick your channel(s) — leave the ready-check one empty to reuse the
   notification channel — and click **💾 Save**.
6. Done! Re-run `/setup` anytime to change any of this later — no restart
   needed, changes apply immediately.

*(Discord limits a single message to 5 dropdown/button rows, which is why
this is split into 2 short steps instead of one long form — but it's still
just a couple of clicks.)*

---

## Class roles & behavior

| Class | Default logo | What `/conquest` shows them below the planning |
|---|---|---|
| Sage (Healer) | 🧙 | Availability menus — creates slots (up to 2/day) |
| Chevalier (Tank) | 🛡️ | Sign-up menu — picks existing slots (up to 2/day) |
| Sorcier (DPS) | 🪄 | Sign-up menu — picks existing slots (up to 2/day) |
| Duelliste (DPS) | 🤺 | Sign-up menu — picks existing slots (up to 2/day) |

When a player signs up for a slot, their class logo is recorded and shown
next to the slot (e.g. `🪄🤺🤺` for one Sorcier and two Duellistes), so
everyone can see the group composition at a glance.

## Spotting your own slots

Discord embeds can't color individual lines of text without breaking the
per-user local-time display, so instead every slot that concerns you (a
Sage's own availability, or a player's own sign-up) is prefixed with 🟢 and
shown in **bold**; everything else gets a plain ▫️. It's not literal text
color, but it makes your own slots easy to pick out at a glance in the list.

## Editing slot changes

Re-run `/conquest` (or use the Today/Tomorrow buttons) — your current picks
show up already checked, whether you're a Sage picking availability or a
player picking slots. Uncheck one and/or check another to change. Everyone
can select **up to 2 slots per day in total**; picking more just ignores the
extras and you'll get a warning.

## Automatic cascade cancellation

If a Sage removes a slot where they were the **last** healer available, and
players had already signed up for it:
- those signups are automatically removed (freeing up their 2-slots/day
  budget);
- they're notified (in the configured notification channel with a mention,
  or by DM as a fallback) to go pick another slot.

If another Sage is still available on that slot, nothing changes for
signed-up players — only the disappearance of the **last** Sage triggers a
cancellation.

## Automatic reminders

A check runs every minute (`src/notifier.js`). For each slot (today or
tomorrow) that:
- starts in less than `NOTIFY_MINUTES_BEFORE` minutes,
- has at least one player signed up,
- hasn't already been notified,

...the bot posts a message in the notification channel mentioning the
Sages available and the players signed up for that specific slot. Each slot
is only notified once.

## Ready-check system

When a slot's start time is reached, the bot posts a message with an
**"I'm ready!"** button, mentioning every Sage and player registered for
that slot, each with their class logo. Clicking the button toggles your
status between ready (✅) and not ready (⬜) — everyone can see who's
actually present in real time. Only people registered for that slot can
mark themselves ready.

## Keeping it running 24/7

Closing the terminal stops the bot. To keep it online all the time without
leaving your own computer on, host it somewhere that stays on:

- **Railway** (https://railway.app) or **Fly.io** (https://fly.io) — both
  have free/cheap tiers and a simple "connect your project, add your `.env`
  variables, deploy" flow, no server management needed.
- A small **VPS** (e.g. a $5/month DigitalOcean or Hetzner box) if you're
  comfortable with a terminal — run `npm install -g pm2` then
  `pm2 start src/index.js --name boss-bot` to keep it running and
  auto-restart on crashes.

⚠️ Note: `data.db` (created next to `src/`) holds all your slots, signups
and settings. If you move the bot to a new host, copy this file along with
it, or you'll need to run `/setup` again and everyone will need to re-pick
their slots.

## Known limitations / possible improvements

- Select menu option labels in `/conquest` are shown in UTC (a Discord
  limitation: a select menu label can't be localized per user). The embed
  above it does show each player's local time via dynamic timestamps.
- No automatic cleanup of old data: you could add a script that deletes
  `slots` rows (and related `notified_slots`, `ready_prompts`,
  `ready_status`, `healer_availabilities`, `signups` rows) older than, say,
  7 days.
- `/setup` currently supports one server at a time per bot instance in terms
  of the background reminder/ready-check jobs (driven by `GUILD_ID` in
  `.env`); the settings themselves are stored per-server in the database,
  so this is easy to extend to multiple servers later if needed.
