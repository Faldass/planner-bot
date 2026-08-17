require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const cron = require("node-cron");

const { ensureSlotsForDate } = require("./db");
const { dateStrUTC, generateSlotsForDate } = require("./slotUtils");
const { handleSelectMenu } = require("./interactions/selectMenuHandler");
const { handleButton } = require("./interactions/buttonHandler");
const { handleRoleSelect, handleChannelSelect } = require("./interactions/setupWizard");
const { startNotifier } = require("./notifier");
const { startReadyCheck } = require("./readyCheck");

const conquest = require("./commands/conquest");
const setup = require("./commands/setup");

const GUILD_ID = process.env.GUILD_ID || null;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();
for (const cmd of [conquest, setup]) {
  client.commands.set(cmd.data.name, cmd);
}

function ensureTodayAndTomorrow() {
  for (const offset of [0, 1]) {
    const dateStr = dateStrUTC(offset);
    ensureSlotsForDate(generateSlotsForDate(dateStr));
  }
  console.log(`[slots] Slots ensured for ${dateStrUTC(0)} and ${dateStrUTC(1)}`);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  ensureTodayAndTomorrow();

  // Every day at 00:05 UTC: generate slots for the new "tomorrow".
  cron.schedule("5 0 * * *", () => {
    ensureTodayAndTomorrow();
  });

  startNotifier(client, {
    guildId: GUILD_ID,
    minutesBefore: Number(process.env.NOTIFY_MINUTES_BEFORE) || 10,
  });

  startReadyCheck(client, { guildId: GUILD_ID });
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
      return;
    }

    if (interaction.isRoleSelectMenu()) {
      await handleRoleSelect(interaction);
      return;
    }

    if (interaction.isChannelSelectMenu()) {
      await handleChannelSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
  } catch (err) {
    console.error(err);
    const errMsg = "❌ Something went wrong, please try again.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errMsg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
