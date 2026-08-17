const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { CLASS_LIST } = require("../classes");
const { getGuildSettings, upsertGuildSettings } = require("../db");

// Transient in-memory draft state while an admin is going through /setup.
// Discord caps messages at 5 action rows, so the 4 role pickers + 2 channel
// pickers + buttons can't all fit on one screen — the wizard is split into
// 2 steps and keeps the in-progress choices here until "Save" is pressed.
// Keyed by guild id (one setup session at a time per server).
const drafts = new Map();

function getDraft(guildId) {
  if (!drafts.has(guildId)) {
    const existing = getGuildSettings(guildId) || {};
    drafts.set(guildId, { ...existing });
  }
  return drafts.get(guildId);
}

function buildStep1Message(guildId) {
  const draft = getDraft(guildId);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Guild Boss Bot Setup — Step 1/2: Class roles")
    .setDescription(
      "Pick the Discord role for each class (the roles must already exist on your server).\n\n" +
        CLASS_LIST.map((c) => {
          const roleId = draft[c.settingsField];
          return `${c.emoji} **${c.name}** — ${roleId ? `<@&${roleId}>` : "_not set_"}`;
        }).join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Only the Sage role will see the availability menus in /conquest." });

  const roleRows = CLASS_LIST.map((c) => {
    const select = new RoleSelectMenuBuilder()
      .setCustomId(`setup_role_${c.key}`)
      .setPlaceholder(`${c.emoji} ${c.name} role`)
      .setMinValues(1)
      .setMaxValues(1);
    if (draft[c.settingsField]) select.setDefaultRoles([draft[c.settingsField]]);
    return new ActionRowBuilder().addComponents(select);
  });

  const nextRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup_next").setLabel("Next ▶").setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [...roleRows, nextRow] };
}

function buildStep2Message(guildId) {
  const draft = getDraft(guildId);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Guild Boss Bot Setup — Step 2/2: Channels")
    .setDescription(
      "Pick the channels used for automatic messages.\n\n" +
        `🔔 **Notifications** — ${draft.notify_channel_id ? `<#${draft.notify_channel_id}>` : "_not set_"}\n` +
        `✅ **Ready checks** — ${draft.ready_channel_id ? `<#${draft.ready_channel_id}>` : "_defaults to the notifications channel_"}`
    )
    .setColor(0x5865f2);

  const notifyRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_channel_notify")
      .setPlaceholder("🔔 Notification channel")
      .setChannelTypes([ChannelType.GuildText])
      .setMinValues(1)
      .setMaxValues(1)
      .setDefaultChannels(draft.notify_channel_id ? [draft.notify_channel_id] : [])
  );

  const readyRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId("setup_channel_ready")
      .setPlaceholder("✅ Ready-check channel (optional)")
      .setChannelTypes([ChannelType.GuildText])
      .setMinValues(0)
      .setMaxValues(1)
      .setDefaultChannels(draft.ready_channel_id ? [draft.ready_channel_id] : [])
  );

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup_back").setLabel("◀ Back").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("setup_save").setLabel("💾 Save").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [notifyRow, readyRow, buttonRow] };
}

async function handleRoleSelect(interaction) {
  const classKey = interaction.customId.replace("setup_role_", "");
  const cls = CLASS_LIST.find((c) => c.key === classKey);
  if (!cls) return;

  const draft = getDraft(interaction.guildId);
  draft[cls.settingsField] = interaction.values[0];

  await interaction.update(buildStep1Message(interaction.guildId));
}

async function handleChannelSelect(interaction) {
  const draft = getDraft(interaction.guildId);
  if (interaction.customId === "setup_channel_notify") {
    draft.notify_channel_id = interaction.values[0] || null;
  } else if (interaction.customId === "setup_channel_ready") {
    draft.ready_channel_id = interaction.values[0] || null;
  }
  await interaction.update(buildStep2Message(interaction.guildId));
}

async function handleSetupButton(interaction) {
  const id = interaction.customId;

  if (id === "setup_next") {
    await interaction.update(buildStep2Message(interaction.guildId));
    return;
  }

  if (id === "setup_back") {
    await interaction.update(buildStep1Message(interaction.guildId));
    return;
  }

  if (id === "setup_save") {
    const draft = getDraft(interaction.guildId);
    const missingRoles = CLASS_LIST.filter((c) => !draft[c.settingsField]);
    const missingParts = [
      ...missingRoles.map((c) => `${c.name} role`),
      !draft.notify_channel_id ? "Notification channel" : null,
    ].filter(Boolean);

    if (missingParts.length > 0) {
      await interaction.reply({
        content: `⚠️ Please set the following before saving: ${missingParts.join(", ")}.`,
        ephemeral: true,
      });
      return;
    }

    if (!draft.ready_channel_id) draft.ready_channel_id = draft.notify_channel_id;

    upsertGuildSettings(interaction.guildId, draft);
    drafts.delete(interaction.guildId);

    const embed = new EmbedBuilder()
      .setTitle("✅ Configuration saved!")
      .setDescription(
        CLASS_LIST.map((c) => `${c.emoji} **${c.name}** — <@&${draft[c.settingsField]}>`).join("\n") +
          `\n\n🔔 Notifications — <#${draft.notify_channel_id}>\n` +
          `✅ Ready checks — <#${draft.ready_channel_id}>\n\n` +
          "Run `/setup` again anytime to change these settings."
      )
      .setColor(0x57f287);

    await interaction.update({ embeds: [embed], components: [] });
  }
}

module.exports = { buildStep1Message, handleRoleSelect, handleChannelSelect, handleSetupButton };
