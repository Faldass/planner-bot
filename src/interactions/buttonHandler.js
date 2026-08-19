const { buildConquestMessage, MAX_SIGNUPS_PER_DAY } = require("../commands/conquest");
const { buildReadyCheckMessage } = require("../readyMessage");
const { buildNewSessionMessage } = require("../newSessionMessage");
const { handleSetupButton } = require("./setupWizard");
const {
  getSlotById,
  getSlotParticipants,
  toggleReady,
  getReadyUserIds,
  getGuildSettings,
  getUserSignupSlotIdsForDate,
  addSignup,
  removeSignup,
} = require("../db");
const { getMemberClass, getClassByKey, getEmojiForClass } = require("../classes");

const SAGE = getClassByKey("healer");

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith("setup_")) {
    await handleSetupButton(interaction);
    return;
  }

  if (id.startsWith("conquest_day_")) {
    const dayOffset = Number(id.replace("conquest_day_", ""));
    const payload = buildConquestMessage(interaction, dayOffset);
    await interaction.update(payload);
    return;
  }

  // --- Ready-check button: ready_<slotId>
  if (id.startsWith("ready_")) {
    const slotId = id.slice("ready_".length);
    const slot = getSlotById(slotId);
    if (!slot) {
      await interaction.reply({ content: "This session no longer exists.", ephemeral: true });
      return;
    }

    const { healers, dps, dpsDetails } = getSlotParticipants(slotId);
    const participants = new Set([...healers, ...dps]);

    if (!participants.has(interaction.user.id)) {
      await interaction.reply({
        content: "❌ You're not registered for this session, so you can't mark yourself ready.",
        ephemeral: true,
      });
      return;
    }

    toggleReady(slotId, interaction.user.id);
    const readyIds = getReadyUserIds(slotId);
    const settings = getGuildSettings(interaction.guildId);
    const payload = buildReadyCheckMessage(interaction.guild, settings, slot, healers, dpsDetails, readyIds);
    await interaction.update(payload);
    return;
  }

  // --- Quick sign-up button on a "new session" announcement: quicksign_<slotId>
  if (id.startsWith("quicksign_")) {
    const slotId = id.slice("quicksign_".length);
    const slot = getSlotById(slotId);
    if (!slot) {
      await interaction.reply({ content: "❌ This session no longer exists.", ephemeral: true });
      return;
    }

    const settings = getGuildSettings(interaction.guildId);
    const memberClass = getMemberClass(interaction.member, settings);

    if (memberClass && memberClass.isHealer) {
      const sageEmoji = getEmojiForClass(interaction.guild, settings, SAGE);
      await interaction.reply({
        content: `${sageEmoji} ${SAGE.name}s create sessions — they don't need to sign up on them.`,
        ephemeral: true,
      });
      return;
    }

    const existingIds = new Set(getUserSignupSlotIdsForDate(interaction.user.id, slot.date));

    // Already signed up: clicking again un-registers them.
    if (existingIds.has(slotId)) {
      removeSignup(slotId, interaction.user.id);
      const { healers, dpsDetails } = getSlotParticipants(slotId);
      await interaction.update(
        buildNewSessionMessage(interaction.guild, settings, slot, healers, dpsDetails)
      );
      await interaction.followUp({
        content: "❌ You've been removed from this session.",
        ephemeral: true,
      });
      return;
    }

    if (existingIds.size >= MAX_SIGNUPS_PER_DAY) {
      await interaction.reply({
        content: `⚠️ You've already picked ${MAX_SIGNUPS_PER_DAY} sessions today. Open \`/conquest\` to swap one out first.`,
        ephemeral: true,
      });
      return;
    }

    addSignup(slotId, interaction.user.id, "dps", memberClass ? memberClass.key : null);
    const { healers, dpsDetails } = getSlotParticipants(slotId);
    await interaction.update(
      buildNewSessionMessage(interaction.guild, settings, slot, healers, dpsDetails)
    );
    await interaction.followUp({
      content: "✅ You're signed up for this session!",
      ephemeral: true,
    });
    return;
  }
}

module.exports = { handleButton };
