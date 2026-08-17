require("dotenv").config();
const { REST, Routes } = require("discord.js");

const conquest = require("./commands/conquest");
const setup = require("./commands/setup");

const commands = [conquest.data.toJSON(), setup.data.toJSON()];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Deploying ${commands.length} command(s)...`);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("✅ Commands deployed successfully to the server.");
  } catch (error) {
    console.error(error);
  }
})();
