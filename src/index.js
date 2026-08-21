require("dotenv").config();
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const cron = require("node-cron");

const { ensureSlotsForDate, cleanupOldData } = require("./db");
const { gameDayStr, generateSlotsForDate } = require("./slotUtils");
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
    const dateStr = gameDayStr(offset);
    ensureSlotsForDate(generateSlotsForDate(dateStr));
  }
  console.log(`[slots] Slots ensured for ${gameDayStr(0)} and ${gameDayStr(1)}`);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  ensureTodayAndTomorrow();

  const deleted = cleanupOldData();
  if (deleted > 0) console.log(`[cleanup] Removed ${deleted} old slot(s) on startup.`);

  // Every day at 15:01 Europe/Paris (just after the game's own 15:00 reset):
  // generate slots for the new game-day cycle. node-cron's timezone option
  // handles the CET/CEST switch automatically, so this always fires at the
  // right UTC instant.
  cron.schedule(
    "1 15 * * *",
    () => {
      ensureTodayAndTomorrow();
    },
    { timezone: "Europe/Paris" }
  );

  // Every day at 15:05 Europe/Paris (just after the slots above are
  // regenerated): wipe everything except today and tomorrow's game-day —
  // old slots, availabilities, signups, and notification/ready-check
  // history. Guild settings from /setup are never touched.
  cron.schedule(
    "5 15 * * *",
    () => {
      const removed = cleanupOldData();
      console.log(`[cleanup] Removed ${removed} old slot(s).`);
    },
    { timezone: "Europe/Paris" }
  );

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
