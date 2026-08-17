const { generateSlotsForDate, slotsInBlock, BLOCKS, dateStrUTC } = require("../slotUtils");
const {
  setHealerAvailabilityForBlock,
  getHealerSlotIdsForUser,
  getUserSignupSlotIdsForDate,
  addSignup,
  removeSignup,
  getHealerCountForSlot,
  getDpsUserIdsForSlot,
  removeAllSignupsForSlot,
  getSlotById,
  getGuildSettings,
} = require("../db");
const {
  buildConquestMessage,
  MAX_HEALER_SLOTS_PER_DAY,
  MAX_SIGNUPS_PER_DAY,
} = require("../commands/conquest");
const { notifyPlayers } = require("../notifyUtil");
const { getMemberClass, getClassByKey, getEmojiForClass } = require("../classes");

const SAGE = getClassByKey("healer");

async function handleSelectMenu(interaction) {
  const id = interaction.customId;

  // --- Healer availability selection: heal_avail_<date>_<blockKey>
  if (id.startsWith("heal_avail_")) {
    const settings = getGuildSettings(interaction.guildId);
    const memberClass = getMemberClass(interaction.member, settings);
    if (!memberClass || !memberClass.isHealer) {
      const sageEmoji = getEmojiForClass(interaction.guild, settings, SAGE);
      await interaction.reply({
        content: `❌ Reserved for ${sageEmoji} ${SAGE.name} members.`,
        ephemeral: true,
      });
      return;
    }

    const rest = id.slice("heal_avail_".length);
    const lastUnderscore = rest.lastIndexOf("_");
    const dateStr = rest.slice(0, lastUnderscore);
    const blockKey = rest.slice(lastUnderscore + 1);

    const block = BLOCKS.find((b) => b.key === blockKey);
    const allSlots = generateSlotsForDate(dateStr);
    const blockSlots = slotsInBlock(allSlots, block);
    const blockSlotIds = blockSlots.map((s) => s.id);

    // Enforce the global "max slots per day" limit across all blocks.
    const existingAllForDay = new Set(getHealerSlotIdsForUser(dateStr, interaction.user.id));
    const outsideBlockCount = [...existingAllForDay].filter(
      (slotId) => !blockSlotIds.includes(slotId)
    ).length;
    const allowedCount = Math.max(0, MAX_HEALER_SLOTS_PER_DAY - outsideBlockCount);
    const requested = interaction.values;
    const finalSelection = requested.slice(0, allowedCount);
    const truncated = requested.length > finalSelection.length;

    const removedIds = setHealerAvailabilityForBlock(
      interaction.user.id,
      blockSlotIds,
      finalSelection
    );

    const dayOffset = dateStr === dateStrUTC(0) ? 0 : 1;
    const payload = buildConquestMessage(interaction, dayOffset);
    await interaction.update(payload);

    if (truncated) {
      await interaction.followUp({
        content: `⚠️ You can select at most ${MAX_HEALER_SLOTS_PER_DAY} slots per day in total. Extra selections were ignored.`,
        ephemeral: true,
      });
    }

    // For each slot this healer just removed: if NO healer is left available
    // on it and players were already signed up, cancel their signups and
    // notify them.
    for (const slotId of removedIds) {
      if (getHealerCountForSlot(slotId) > 0) continue;

      const affectedPlayers = getDpsUserIdsForSlot(slotId);
      if (affectedPlayers.length === 0) continue;

      removeAllSignupsForSlot(slotId);

      const slot = getSlotById(slotId);
      await notifyPlayers(
        interaction.client,
        interaction.guildId,
        affectedPlayers,
        `⚠️ **Slot cancelled** (<t:${slot.start_utc}:t> - <t:${slot.end_utc}:t>): ` +
          `no ${SAGE.name} is available for this slot anymore. Your signup was removed, ` +
          `please pick another slot with \`/conquest\`.`
      );
    }
    return;
  }

  // --- Player slot selection: signup_select_<date>_<chunkIdx>
  if (id.startsWith("signup_select_")) {
    const settings = getGuildSettings(interaction.guildId);
    const memberClass = getMemberClass(interaction.member, settings);

    const rest = id.slice("signup_select_".length);
    const lastUnderscore = rest.lastIndexOf("_");
    const dateStr = rest.slice(0, lastUnderscore);

    const existingIds = new Set(getUserSignupSlotIdsForDate(interaction.user.id, dateStr));
    const selectedInThisMenu = new Set(interaction.values);

    // We only know the options of THIS menu (chunk): remove any that were
    // unchecked and belong to this chunk, then try to add the new ones.
    const menuOptionValues = new Set(
      interaction.component.options.map((o) => o.value)
    );

    for (const slotId of menuOptionValues) {
      const wasSelected = existingIds.has(slotId);
      const nowSelected = selectedInThisMenu.has(slotId);
      if (wasSelected && !nowSelected) {
        removeSignup(slotId, interaction.user.id);
        existingIds.delete(slotId);
      }
    }

    let blocked = false;
    for (const slotId of selectedInThisMenu) {
      if (!existingIds.has(slotId)) {
        if (existingIds.size >= MAX_SIGNUPS_PER_DAY) {
          blocked = true;
          continue;
        }
        addSignup(slotId, interaction.user.id, "dps", memberClass ? memberClass.key : null);
        existingIds.add(slotId);
      }
    }

    const dayOffset = dateStr === dateStrUTC(0) ? 0 : 1;
    const payload = buildConquestMessage(interaction, dayOffset);
    await interaction.update(payload);

    if (blocked) {
      await interaction.followUp({
        content: `⚠️ You've reached the limit of ${MAX_SIGNUPS_PER_DAY} slots for this day. Deselect one first if you want to change.`,
        ephemeral: true,
      });
    }
    return;
  }
}

module.exports = { handleSelectMenu };
