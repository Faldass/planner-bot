const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { buildStep1Message } = require("../interactions/setupWizard");

const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("(Admin) Configure the bot: class roles and notification channels")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function execute(interaction) {
  const payload = buildStep1Message(interaction.guildId);
  await interaction.reply({ ...payload, ephemeral: true });
}

module.exports = { data, execute };
