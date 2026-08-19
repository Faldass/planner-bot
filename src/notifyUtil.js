const { getGuildSettings } = require("./db");

/**
 * Sends a notification about affected players to the guild's configured
 * notification channel (set via /setup), mentioning everyone concerned.
 * No DM fallback: if no channel is configured yet or the bot can't reach
 * it, the notification is simply skipped (and logged).
 */
async function notifyPlayers(client, guildId, userIds, content) {
  if (!userIds || userIds.length === 0) return;

  const settings = getGuildSettings(guildId);
  const channelId = settings && settings.notify_channel_id;

  if (!channelId) {
    console.warn("[notifyPlayers] No notification channel configured for this guild yet (run /setup).");
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn("[notifyPlayers] Could not fetch the notification channel.");
    return;
  }

  const mentions = userIds.map((id) => `<@${id}>`).join(" ");
  await channel.send({
    content: `${content}\n${mentions}`,
    allowedMentions: { users: userIds },
  });
}

module.exports = { notifyPlayers };
