const cron = require("node-cron");
const { dateStrUTC } = require("./slotUtils");
const {
  getSlotsWithHealers,
  getSlotParticipants,
  isReadyPromptPosted,
  markReadyPromptPosted,
  getGuildSettings,
} = require("./db");
const { buildReadyCheckMessage } = require("./readyMessage");

/**
 * Checks every minute for slots that just started. For each one with at
 * least one participant (healer or player) and no ready-check posted yet,
 * it sends a message with an "I'm ready!" button so participants can mark
 * their presence.
 */
function startReadyCheck(client, { guildId }) {
  if (!guildId) {
    console.warn("[ready-check] GUILD_ID not set: ready-check disabled.");
    return;
  }

  cron.schedule("* * * * *", async () => {
    try {
      await checkSlotsStarting(client, guildId);
    } catch (err) {
      console.error("[ready-check] Error:", err);
    }
  });

  console.log("[ready-check] Enabled.");
}

async function checkSlotsStarting(client, guildId) {
  const settings = getGuildSettings(guildId);
  if (!settings || !settings.notify_channel_id) return; // bot not configured via /setup yet

  const guild = client.guilds.cache.get(guildId) || null;
  const channelId = settings.ready_channel_id || settings.notify_channel_id;
  const now = Math.floor(Date.now() / 1000);

  for (const dateStr of [dateStrUTC(0), dateStrUTC(1)]) {
    const slots = getSlotsWithHealers(dateStr);

    for (const slot of slots) {
      // Slot must have just started, within the last minute.
      if (now < slot.start_utc || now - slot.start_utc > 60) continue;
      if (isReadyPromptPosted(slot.id)) continue;

      const { healers, dps, dpsDetails } = getSlotParticipants(slot.id);
      const participants = [...new Set([...healers, ...dps])];
      if (participants.length === 0) continue;

      markReadyPromptPosted(slot.id);

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.warn("[ready-check] Could not fetch the ready-check channel.");
        continue;
      }

      const mentions = participants.map((id) => `<@${id}>`).join(" ");
      const payload = buildReadyCheckMessage(guild, settings, slot, healers, dpsDetails, []);
      await channel.send({ content: mentions, ...payload });
    }
  }
}

module.exports = { startReadyCheck };
