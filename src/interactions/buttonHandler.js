const { buildConquestMessage } = require("../commands/conquest");
const { buildReadyCheckMessage } = require("../readyMessage");
const { handleSetupButton } = require("./setupWizard");
const {
  getSlotById,
  getSlotParticipants,
  toggleReady,
  getReadyUserIds,
  getGuildSettings,
} = require("../db");

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
      await interaction.reply({ content: "This slot no longer exists.", ephemeral: true });
      return;
    }

    const { healers, dps, dpsDetails } = getSlotParticipants(slotId);
    const participants = new Set([...healers, ...dps]);

    if (!participants.has(interaction.user.id)) {
      await interaction.reply({
        content: "❌ You're not registered for this slot, so you can't mark yourself ready.",
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
}

module.exports = { handleButton };
