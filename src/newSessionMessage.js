const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getEmojiForClass, getEmojiForClassKey, getClassByKey } = require("./classes");
const { formatSlotDateTime } = require("./slotUtils");

const SAGE = getClassByKey("healer");

/**
 * Builds the public announcement posted when a Sage adds a new session,
 * with a button letting anyone sign up for it in one click. healers/
 * dpsDetails are re-fetched live each time this is rebuilt, so the message
 * always reflects who's currently on the session (even if several Sages
 * end up covering the same slot, or players sign up/leave afterwards).
 */
function buildNewSessionMessage(guild, settings, slot, healerIds, dpsDetails) {
  const sageEmoji = getEmojiForClass(guild, settings, SAGE);

  const healerText = healerIds.length
    ? healerIds.map((id) => `${sageEmoji} <@${id}>`).join("\n")
    : "_none_";

  const signedUpText = dpsDetails.length
    ? dpsDetails
        .map((d) => `${getEmojiForClassKey(guild, settings, d.class_key)} <@${d.user_id}>`)
        .join("\n")
    : "_nobody yet — be the first!_";

  const embed = new EmbedBuilder()
    .setTitle("🆕 New session added!")
    .setDescription(`**${formatSlotDateTime(slot)}**`)
    .addFields(
      { name: `${sageEmoji} ${SAGE.name}(s)`, value: healerText, inline: true },
      { name: "⚔️ Signed up", value: signedUpText, inline: true }
    )
    .setColor(0x57f287)
    .setFooter({ text: "Click the button below to sign up instantly (max 2 sessions/day)." });

  const button = new ButtonBuilder()
    .setCustomId(`quicksign_${slot.id}`)
    .setLabel("Sign up for this session")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("⚔️");

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(button)] };
}

module.exports = { buildNewSessionMessage };
