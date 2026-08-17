const { getGuildSettings } = require("./db");

/**
 * Sends a notification about affected players to the guild's configured
 * notification channel (set via /setup), mentioning everyone concerned.
 * Falls back to individual DMs only if no channel is configured yet or the
 * bot can't reach it.
 */
async function notifyPlayers(client, guildId, userIds, content) {
  if (!userIds || userIds.length === 0) return;

  const settings = getGuildSettings(guildId);
  const channelId = settings && settings.notify_channel_id;

  if (channelId) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
      const mentions = userIds.map((id) => `<@${id}>`).join(" ");
      await channel.send({
        content: `${content}\n${mentions}`,
        allowedMentions: { users: userIds },
      });
      return;
    }
  }

  // Fallback: individual DM if no channel is configured/reachable yet.
  for (const id of userIds) {
    try {
      const user = await client.users.fetch(id);
      await user.send(content);
    } catch {
      // DMs closed or user unreachable: fail silently.
    }
  }
}

module.exports = { notifyPlayers };
