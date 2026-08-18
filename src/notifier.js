const cron = require("node-cron");
const { dateStrUTC } = require("./slotUtils");
const {
  getSlotsWithHealers,
  getSlotParticipants,
  isSlotNotified,
  markSlotNotified,
  getGuildSettings,
} = require("./db");
const { getClassByKey, getEmojiForClass } = require("./classes");

const SAGE = getClassByKey("healer");

/**
 * Runs a check every minute: for each slot (today + tomorrow) that has at
 * least one signup, starts in <= NOTIFY_MINUTES_BEFORE minutes, and hasn't
 * been notified yet, sends a ping in the guild's configured notification
 * channel mentioning the healers and players signed up.
 */
function startNotifier(client, { guildId, minutesBefore }) {
  if (!guildId) {
    console.warn("[notifier] GUILD_ID not set in .env: notifications disabled.");
    return;
  }

  cron.schedule("* * * * *", async () => {
    try {
      await checkAndNotify(client, guildId, minutesBefore);
    } catch (err) {
      console.error("[notifier] Error while checking:", err);
    }
  });

  console.log(`[notifier] Notifications enabled: ${minutesBefore} min before each slot.`);
}

async function checkAndNotify(client, guildId, minutesBefore) {
  const settings = getGuildSettings(guildId);
  if (!settings || !settings.notify_channel_id) return; // bot not configured via /setup yet

  const guild = client.guilds.cache.get(guildId) || null;
  const sageEmoji = getEmojiForClass(guild, settings, SAGE);

  const now = Math.floor(Date.now() / 1000);
  const thresholdSeconds = minutesBefore * 60;

  for (const dateStr of [dateStrUTC(0), dateStrUTC(1)]) {
    const slots = getSlotsWithHealers(dateStr);

    for (const slot of slots) {
      const secondsUntil = slot.start_utc - now;

      // Slot already started, or too far away: skip.
      if (secondsUntil <= 0 || secondsUntil > thresholdSeconds) continue;

      // Already notified -> don't spam.
      if (isSlotNotified(slot.id)) continue;

      const { healers, dps } = getSlotParticipants(slot.id);

      // Mark as notified BEFORE sending, to avoid double sends if two
      // checks overlap.
      markSlotNotified(slot.id);

      const channel = await client.channels.fetch(settings.notify_channel_id).catch(() => null);
      if (!channel) {
        console.warn("[notifier] Could not fetch the notification channel.");
        continue;
      }

      const healerMentions = healers.length ? healers.map((id) => `<@${id}>`).join(" ") : "_none_";
      const dpsMentions = dps.length ? dps.map((id) => `<@${id}>`).join(" ") : "_none_";

      await channel.send({
        content:
          `⚔️ **Boss attack in ${minutesBefore} minutes!** ` +
          `(<t:${slot.start_utc}:t>)\n` +
          `${sageEmoji} ${SAGE.name}(s): ${healerMentions}\n` +
          `⚔️ Players: ${dpsMentions}`,
        allowedMentions: { users: [...new Set([...healers, ...dps])] },
      });
    }
  }
}

module.exports = { startNotifier, checkAndNotify };
