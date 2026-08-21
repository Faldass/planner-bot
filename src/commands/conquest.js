const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");
const {
  BLOCKS,
  gameDayStr,
  generateSlotsForDate,
  slotsInBlock,
  formatSlotTime,
  formatSlotLabel,
} = require("../slotUtils");
const {
  getSlotsWithHealers,
  getUserSignupSlotIdsForDate,
  getDpsSignupsForSlot,
  getHealerSlotIdsForUser,
  getGuildSettings,
} = require("../db");
const { getMemberClass, getClassByKey, getEmojiForClass, getEmojiForClassKey } = require("../classes");

const MAX_SIGNUPS_PER_DAY = 2;
const MAX_HEALER_SLOTS_PER_DAY = 2;
const SAGE = getClassByKey("healer");

/**
 * Builds the unified /conquest view for a given day: the planning list
 * (same for everyone, with the viewer's own slots marked 🟢) plus, below
 * it, either the Sage's own availability selects or the sign-up select for
 * everyone else — decided from the viewer's live Discord roles.
 */
function buildConquestMessage(interaction, dayOffset) {
  const { guild, member } = interaction;
  const settings = getGuildSettings(interaction.guildId);
  const memberClass = getMemberClass(member, settings);
  const isSage = !!(memberClass && memberClass.isHealer);

  const dateStr = gameDayStr(dayOffset);
  const slotsWithHealers = getSlotsWithHealers(dateStr);

  const mySignupIds = new Set(getUserSignupSlotIdsForDate(interaction.user.id, dateStr));
  const myHealerIds = new Set(getHealerSlotIdsForUser(dateStr, interaction.user.id));

  const sageEmoji = getEmojiForClass(guild, settings, SAGE);

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Conquest — ${dayOffset === 0 ? "Today" : "Tomorrow"} (${dateStr})`)
    .setColor(0xed4245);

  if (slotsWithHealers.length === 0) {
    embed.setDescription(
      `No session has a ${SAGE.name} available yet for this day. Check back later!`
    );
  } else {
    embed.setDescription(
      slotsWithHealers
        .map((s) => {
          const involved = isSage ? myHealerIds.has(s.id) : mySignupIds.has(s.id);
          const dpsSignups = getDpsSignupsForSlot(s.id);
          const classIcons = dpsSignups.length
            ? dpsSignups.map((d) => getEmojiForClassKey(guild, settings, d.class_key)).join("")
            : "–";
          const line = `${formatSlotTime(s)} — ${sageEmoji}×${s.healer_count}  ${classIcons} (${s.signup_count})`;
          return involved ? `🟢 **${line}**` : `▫️ ${line}`;
        })
        .join("\n")
    );
  }

  embed.setFooter({
    text: isSage
      ? `🟢 = sessions you've made available. Pick more below (max ${MAX_HEALER_SLOTS_PER_DAY}/day).`
      : `🟢 = sessions you've picked. Pick up to ${MAX_SIGNUPS_PER_DAY}/day below — uncheck then recheck to change.`,
  });

  const dayRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("conquest_day_0")
      .setLabel("Today")
      .setStyle(dayOffset === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("conquest_day_1")
      .setLabel("Tomorrow")
      .setStyle(dayOffset === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const components = [dayRow];

  if (isSage) {
    // Same block selects as the old /healer-availability, letting the Sage
    // create/edit their own slots. Each block's placeholder is derived from
    // the actual UTC times of its first/last slot (the reset's UTC offset
    // shifts with DST, so this can't be a static label).
    const allSlots = generateSlotsForDate(dateStr);
    for (const b of BLOCKS) {
      const blockSlots = slotsInBlock(allSlots, b);
      const rangeLabel = `${formatSlotLabel(blockSlots[0])} → ${formatSlotLabel(blockSlots[blockSlots.length - 1])}`;
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`heal_avail_${dateStr}_${b.key}`)
        .setPlaceholder(rangeLabel)
        .setMinValues(0)
        .setMaxValues(Math.min(MAX_HEALER_SLOTS_PER_DAY, blockSlots.length))
        .addOptions(
          blockSlots.map((s) => ({
            label: formatSlotLabel(s),
            value: s.id,
            default: myHealerIds.has(s.id),
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    }
  } else if (slotsWithHealers.length > 0) {
    // Same sign-up select as the old /planning, letting the player pick an
    // already-created slot.
    const chunks = [];
    for (let i = 0; i < slotsWithHealers.length; i += 25) {
      chunks.push(slotsWithHealers.slice(i, i + 25));
    }
    chunks.forEach((chunk, idx) => {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`signup_select_${dateStr}_${idx}`)
        .setPlaceholder("Pick one or two sessions")
        .setMinValues(0)
        .setMaxValues(Math.min(MAX_SIGNUPS_PER_DAY, chunk.length))
        .addOptions(
          chunk.map((s) => ({
            label: new Date(s.start_utc * 1000).toISOString().slice(11, 16) + " UTC",
            description: `${s.healer_count} ${SAGE.name}(s) · ${s.signup_count} signed up`,
            value: s.id,
            default: mySignupIds.has(s.id),
          }))
        );
      components.push(new ActionRowBuilder().addComponents(menu));
    });
  }

  return { embeds: [embed], components };
}

const data = new SlashCommandBuilder()
  .setName("conquest")
  .setDescription("View the boss attack planning and manage your slots");

async function execute(interaction) {
  const settings = getGuildSettings(interaction.guildId);
  if (!settings || !settings.healer_role_id) {
    await interaction.reply({
      content: "⚠️ This bot hasn't been configured yet. Ask an admin to run `/setup` first.",
      ephemeral: true,
    });
    return;
  }

  const payload = buildConquestMessage(interaction, 0);
  await interaction.reply({ ...payload, ephemeral: true });
}

module.exports = {
  data,
  execute,
  buildConquestMessage,
  MAX_SIGNUPS_PER_DAY,
  MAX_HEALER_SLOTS_PER_DAY,
};
