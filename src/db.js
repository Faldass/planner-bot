const Database = require("better-sqlite3");
const path = require("path");
const { gameDayStr } = require("./slotUtils");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "data.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_utc INTEGER NOT NULL,
  end_utc INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS healer_availabilities (
  slot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS signups (
  slot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dps',
  class_key TEXT,
  PRIMARY KEY (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS notified_slots (
  slot_id TEXT PRIMARY KEY,
  notified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ready_prompts (
  slot_id TEXT PRIMARY KEY,
  posted_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ready_status (
  slot_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ready_at INTEGER NOT NULL,
  PRIMARY KEY (slot_id, user_id)
);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  healer_role_id TEXT,
  tank_role_id TEXT,
  dps_role_id_1 TEXT,
  dps_role_id_2 TEXT,
  notify_channel_id TEXT,
  ready_channel_id TEXT,
  nemesis_role_id TEXT,
  nemesis_ping_enabled INTEGER NOT NULL DEFAULT 1
);
`);

// Lightweight migration: add any columns introduced after a guild's data.db
// was first created, so existing deployments don't break when the schema
// grows (CREATE TABLE IF NOT EXISTS alone only helps brand-new databases).
{
  const existingColumns = db.prepare("PRAGMA table_info(guild_settings)").all().map((c) => c.name);
  const columnMigrations = [
    { name: "nemesis_role_id", ddl: "ALTER TABLE guild_settings ADD COLUMN nemesis_role_id TEXT" },
    {
      name: "nemesis_ping_enabled",
      ddl: "ALTER TABLE guild_settings ADD COLUMN nemesis_ping_enabled INTEGER NOT NULL DEFAULT 1",
    },
  ];
  for (const migration of columnMigrations) {
    if (!existingColumns.includes(migration.name)) {
      db.exec(migration.ddl);
    }
  }
}

// --- Guild settings (configured through /setup) ---

function getGuildSettings(guildId) {
  return db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId) || null;
}

function upsertGuildSettings(guildId, settings) {
  db.prepare(
    `INSERT INTO guild_settings
       (guild_id, healer_role_id, tank_role_id, dps_role_id_1, dps_role_id_2, notify_channel_id, ready_channel_id, nemesis_role_id, nemesis_ping_enabled)
     VALUES (@guild_id, @healer_role_id, @tank_role_id, @dps_role_id_1, @dps_role_id_2, @notify_channel_id, @ready_channel_id, @nemesis_role_id, @nemesis_ping_enabled)
     ON CONFLICT(guild_id) DO UPDATE SET
       healer_role_id = excluded.healer_role_id,
       tank_role_id = excluded.tank_role_id,
       dps_role_id_1 = excluded.dps_role_id_1,
       dps_role_id_2 = excluded.dps_role_id_2,
       notify_channel_id = excluded.notify_channel_id,
       ready_channel_id = excluded.ready_channel_id,
       nemesis_role_id = excluded.nemesis_role_id,
       nemesis_ping_enabled = excluded.nemesis_ping_enabled`
  ).run({
    guild_id: guildId,
    healer_role_id: settings.healer_role_id || null,
    tank_role_id: settings.tank_role_id || null,
    dps_role_id_1: settings.dps_role_id_1 || null,
    dps_role_id_2: settings.dps_role_id_2 || null,
    notify_channel_id: settings.notify_channel_id || null,
    ready_channel_id: settings.ready_channel_id || null,
    nemesis_role_id: settings.nemesis_role_id || null,
    nemesis_ping_enabled: settings.nemesis_ping_enabled == null ? 1 : settings.nemesis_ping_enabled,
  });
}

// --- Slots ---

function ensureSlotsForDate(slots) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO slots (id, date, start_utc, end_utc) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction((rows) => {
    for (const s of rows) insert.run(s.id, s.date, s.start_utc, s.end_utc);
  });
  tx(slots);
}

function getSlotsByIds(ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM slots WHERE id IN (${placeholders})`).all(...ids);
}

function getSlotById(slotId) {
  return db.prepare("SELECT * FROM slots WHERE id = ?").get(slotId);
}

/**
 * Replace a healer's availability for ONE block (e.g. "morning") with the new
 * selection. blockSlotIds = every possible slot id in that block,
 * selectedIds = the ones checked in the select menu right now.
 * Returns the list of slots this healer just REMOVED (useful to detect a
 * slot that ends up with zero healers left).
 */
function setHealerAvailabilityForBlock(userId, blockSlotIds, selectedIds) {
  const existing = blockSlotIds.length
    ? db
        .prepare(
          `SELECT slot_id FROM healer_availabilities
           WHERE user_id = ? AND slot_id IN (${blockSlotIds.map(() => "?").join(",")})`
        )
        .all(userId, ...blockSlotIds)
    : [];
  const existingSet = new Set(existing.map((r) => r.slot_id));
  const selectedSet = new Set(selectedIds);
  const removedIds = [...existingSet].filter((id) => !selectedSet.has(id));

  const del = db.prepare(
    "DELETE FROM healer_availabilities WHERE slot_id = ? AND user_id = ?"
  );
  const ins = db.prepare(
    "INSERT OR IGNORE INTO healer_availabilities (slot_id, user_id) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    for (const id of blockSlotIds) del.run(id, userId);
    for (const id of selectedIds) ins.run(id, userId);
  });
  tx();

  return removedIds;
}

function getHealerCountForSlot(slotId) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM healer_availabilities WHERE slot_id = ?")
    .get(slotId).c;
}

function getDpsUserIdsForSlot(slotId) {
  return db
    .prepare("SELECT user_id FROM signups WHERE slot_id = ? AND role = 'dps'")
    .all(slotId)
    .map((r) => r.user_id);
}

/**
 * Same as getDpsUserIdsForSlot but also returns each player's class key,
 * used to display their class logo in the planning.
 */
function getDpsSignupsForSlot(slotId) {
  return db
    .prepare("SELECT user_id, class_key FROM signups WHERE slot_id = ? AND role = 'dps'")
    .all(slotId);
}

function removeAllSignupsForSlot(slotId) {
  db.prepare("DELETE FROM signups WHERE slot_id = ?").run(slotId);
}

function getHealerSlotIdsForUser(dateStr, userId) {
  return db
    .prepare(
      `SELECT ha.slot_id FROM healer_availabilities ha
       JOIN slots s ON s.id = ha.slot_id
       WHERE s.date = ? AND ha.user_id = ?`
    )
    .all(dateStr, userId)
    .map((r) => r.slot_id);
}

/**
 * Slots for a date that have AT LEAST one healer available, with counters.
 */
function getSlotsWithHealers(dateStr) {
  return db
    .prepare(
      `SELECT s.*,
              COUNT(DISTINCT ha.user_id) AS healer_count,
              COUNT(DISTINCT sg.user_id) AS signup_count
       FROM slots s
       JOIN healer_availabilities ha ON ha.slot_id = s.id
       LEFT JOIN signups sg ON sg.slot_id = s.id
       WHERE s.date = ?
       GROUP BY s.id
       ORDER BY s.start_utc ASC`
    )
    .all(dateStr);
}

function getUserSignupCountForDate(userId, dateStr) {
  return db
    .prepare(
      `SELECT COUNT(*) AS c FROM signups sg
       JOIN slots s ON s.id = sg.slot_id
       WHERE sg.user_id = ? AND s.date = ?`
    )
    .get(userId, dateStr).c;
}

function getUserSignupSlotIdsForDate(userId, dateStr) {
  return db
    .prepare(
      `SELECT sg.slot_id FROM signups sg
       JOIN slots s ON s.id = sg.slot_id
       WHERE sg.user_id = ? AND s.date = ?`
    )
    .all(userId, dateStr)
    .map((r) => r.slot_id);
}

function addSignup(slotId, userId, role = "dps", classKey = null) {
  db.prepare(
    "INSERT OR IGNORE INTO signups (slot_id, user_id, role, class_key) VALUES (?, ?, ?, ?)"
  ).run(slotId, userId, role, classKey);
}

function removeSignup(slotId, userId) {
  db.prepare("DELETE FROM signups WHERE slot_id = ? AND user_id = ?").run(
    slotId,
    userId
  );
}

function getSignupsForSlot(slotId) {
  return db.prepare("SELECT * FROM signups WHERE slot_id = ?").all(slotId);
}

function getUserSlotsForDate(userId, dateStr) {
  return db
    .prepare(
      `SELECT s.* FROM signups sg
       JOIN slots s ON s.id = sg.slot_id
       WHERE sg.user_id = ? AND s.date = ?
       ORDER BY s.start_utc ASC`
    )
    .all(userId, dateStr);
}

/**
 * Healers available for a slot + DPS/Tank signed up for it (with class info).
 */
function getSlotParticipants(slotId) {
  const healers = db
    .prepare("SELECT user_id FROM healer_availabilities WHERE slot_id = ?")
    .all(slotId)
    .map((r) => r.user_id);
  const dpsDetails = getDpsSignupsForSlot(slotId);
  const dps = dpsDetails.map((r) => r.user_id);
  return { healers, dps, dpsDetails };
}

function isSlotNotified(slotId) {
  return !!db.prepare("SELECT 1 FROM notified_slots WHERE slot_id = ?").get(slotId);
}

function markSlotNotified(slotId) {
  db.prepare(
    "INSERT OR IGNORE INTO notified_slots (slot_id, notified_at) VALUES (?, ?)"
  ).run(slotId, Math.floor(Date.now() / 1000));
}

// --- Ready-check ---

function isReadyPromptPosted(slotId) {
  return !!db.prepare("SELECT 1 FROM ready_prompts WHERE slot_id = ?").get(slotId);
}

function markReadyPromptPosted(slotId) {
  db.prepare(
    "INSERT OR IGNORE INTO ready_prompts (slot_id, posted_at) VALUES (?, ?)"
  ).run(slotId, Math.floor(Date.now() / 1000));
}

/**
 * Toggles a user's "ready" status for a slot. Returns true if now ready,
 * false if it was just cancelled.
 */
function toggleReady(slotId, userId) {
  const existing = db
    .prepare("SELECT 1 FROM ready_status WHERE slot_id = ? AND user_id = ?")
    .get(slotId, userId);
  if (existing) {
    db.prepare("DELETE FROM ready_status WHERE slot_id = ? AND user_id = ?").run(
      slotId,
      userId
    );
    return false;
  }
  db.prepare(
    "INSERT INTO ready_status (slot_id, user_id, ready_at) VALUES (?, ?, ?)"
  ).run(slotId, userId, Math.floor(Date.now() / 1000));
  return true;
}

function getReadyUserIds(slotId) {
  return db
    .prepare("SELECT user_id FROM ready_status WHERE slot_id = ?")
    .all(slotId)
    .map((r) => r.user_id);
}

/**
 * Deletes every slot (and its related rows: healer availabilities, signups,
 * notification/ready-check history) for any date other than today or
 * tomorrow — i.e. keeps only what /conquest can currently show, and clears
 * out everything older. Guild settings (from /setup) are never touched.
 * Returns the number of slots deleted.
 */
function cleanupOldData() {
  const todayStr = gameDayStr(0);
  const tomorrowStr = gameDayStr(1);

  const tx = db.transaction(() => {
    const dependentTables = [
      "healer_availabilities",
      "signups",
      "notified_slots",
      "ready_prompts",
      "ready_status",
    ];
    for (const table of dependentTables) {
      db.prepare(
        `DELETE FROM ${table} WHERE slot_id IN (SELECT id FROM slots WHERE date NOT IN (?, ?))`
      ).run(todayStr, tomorrowStr);
    }
    return db.prepare("DELETE FROM slots WHERE date NOT IN (?, ?)").run(todayStr, tomorrowStr)
      .changes;
  });

  return tx();
}

module.exports = {
  db,
  getGuildSettings,
  upsertGuildSettings,
  ensureSlotsForDate,
  getSlotsByIds,
  getSlotById,
  setHealerAvailabilityForBlock,
  getHealerCountForSlot,
  getDpsUserIdsForSlot,
  getDpsSignupsForSlot,
  removeAllSignupsForSlot,
  getHealerSlotIdsForUser,
  getSlotsWithHealers,
  getUserSignupCountForDate,
  getUserSignupSlotIdsForDate,
  addSignup,
  removeSignup,
  getSignupsForSlot,
  getUserSlotsForDate,
  getSlotParticipants,
  isSlotNotified,
  markSlotNotified,
  isReadyPromptPosted,
  markReadyPromptPosted,
  toggleReady,
  getReadyUserIds,
  cleanupOldData,
};
