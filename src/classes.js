// Maps the guild's 4 gameplay classes to a Discord role (configured via
// /setup). Each class has a default fallback emoji, but if the admin has
// set a native Discord role icon (Server Settings > Roles > role icon,
// using a unicode emoji), that emoji is used instead automatically.

const CLASS_LIST = [
  { key: "healer", settingsField: "healer_role_id", name: "Sage", emoji: "🧙", isHealer: true },
  { key: "tank", settingsField: "tank_role_id", name: "Chevalier", emoji: "🛡️", isHealer: false },
  { key: "dps1", settingsField: "dps_role_id_1", name: "Sorcier", emoji: "🪄", isHealer: false },
  { key: "dps2", settingsField: "dps_role_id_2", name: "Duelliste", emoji: "🤺", isHealer: false },
];

function getClassByKey(key) {
  return CLASS_LIST.find((c) => c.key === key) || null;
}

/**
 * Returns the emoji to show for a class: the server's own role icon emoji
 * if the admin set one on the Discord role itself, otherwise a sensible
 * default. Role icons are always in the guild's role cache (no extra fetch
 * needed — roles are sent with every GUILD_CREATE event).
 */
function getEmojiForClass(guild, settings, cls) {
  if (!cls) return "❔";
  const roleId = settings && settings[cls.settingsField];
  const role = roleId && guild ? guild.roles.cache.get(roleId) : null;
  return (role && role.unicodeEmoji) || cls.emoji;
}

function getEmojiForClassKey(guild, settings, key) {
  return getEmojiForClass(guild, settings, getClassByKey(key));
}

/**
 * Determines a guild member's class based on the roles configured for this
 * guild (via /setup). Returns null if the guild hasn't been configured yet,
 * or if the member has none of the 4 class roles. If a member somehow has
 * several class roles, the first match (in CLASS_LIST order) wins.
 */
function getMemberClass(member, settings) {
  if (!settings) return null;
  for (const cls of CLASS_LIST) {
    const roleId = settings[cls.settingsField];
    if (roleId && member.roles.cache.has(roleId)) return cls;
  }
  return null;
}

module.exports = {
  CLASS_LIST,
  getClassByKey,
  getEmojiForClass,
  getEmojiForClassKey,
  getMemberClass,
};
