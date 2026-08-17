const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getEmojiForClass, getEmojiForClassKey, getClassByKey } = require("./classes");

const SAGE = getClassByKey("healer");

/**
 * Builds the ready-check embed + button for a slot that just started.
 * dpsDetails = [{ user_id, class_key }], readyIds = user ids already ready.
 */
function buildReadyCheckMessage(guild, settings, slot, healers, dpsDetails, readyIds) {
  const readySet = new Set(readyIds);
  const sageEmoji = getEmojiForClass(guild, settings, SAGE);

  const formatHealers = (ids) => {
    if (ids.length === 0) return "_none_";
    return ids.map((id) => `${readySet.has(id) ? "✅" : "⬜"} ${sageEmoji} <@${id}>`).join("\n");
  };

  const formatDps = (details) => {
    if (details.length === 0) return "_none_";
    return details
      .map(
        (d) =>
          `${readySet.has(d.user_id) ? "✅" : "⬜"} ${getEmojiForClassKey(guild, settings, d.class_key)} <@${d.user_id}>`
      )
      .join("\n");
  };

  const total = new Set([...healers, ...dpsDetails.map((d) => d.user_id)]).size;

  const embed = new EmbedBuilder()
    .setTitle("🐉 Boss attack starting now!")
    .setDescription(
      `Slot: <t:${slot.start_utc}:t> - <t:${slot.end_utc}:t>\n\nClick the button below when you're ready to attack.`
    )
    .addFields(
      { name: `${sageEmoji} ${SAGE.name}`, value: formatHealers(healers), inline: true },
      { name: "⚔️ Players", value: formatDps(dpsDetails), inline: true }
    )
    .setColor(0xfee75c)
    .setFooter({ text: `${readyIds.length}/${total} ready` });

  const button = new ButtonBuilder()
    .setCustomId(`ready_${slot.id}`)
    .setLabel("I'm ready!")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

module.exports = { buildReadyCheckMessage };
