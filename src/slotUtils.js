// Everything is computed and stored in UTC internally, but the notion of
// "day" used throughout the bot is not the UTC calendar day — it's the
// game's own reset cycle: 15:00 Europe/Paris time (which automatically
// shifts between UTC+1 in winter and UTC+2 in summer). A "game day" spans
// from 15:00 Paris to 15:00 Paris the next day, and is identified by the
// Paris calendar date on which it STARTS.
//
// Each player still sees every individual time converted to their own local
// timezone thanks to Discord's dynamic timestamps (<t:EPOCH:t>), rendered
// client-side by the Discord app — only the internal "which day/reset-cycle
// does this slot belong to" bookkeeping is anchored to Paris time.

const SLOT_MINUTES = 15;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES; // 96
const RESET_HOUR = 15; // 15:00 Europe/Paris

// The slots of a game day are split into 4 equally-sized groups purely to
// stay under Discord's 25-option limit per select menu (96 slots / 4 = 24,
// still comfortably under that cap). Their real UTC times are computed
// live (see conquest.js) since the reset's UTC offset shifts with DST.
const NUM_BLOCKS = 4;
const BLOCK_SIZE = SLOTS_PER_DAY / NUM_BLOCKS;
const BLOCKS = Array.from({ length: NUM_BLOCKS }, (_, i) => ({
  key: `b${i}`,
  startIndex: i * BLOCK_SIZE,
  endIndex: (i + 1) * BLOCK_SIZE,
}));

/**
 * Returns the Europe/Paris UTC offset, in minutes, that applies at a given
 * instant (e.g. +60 for CET in winter, +120 for CEST in summer during DST).
 */
function parisOffsetMinutesAt(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzPart = parts.find((p) => p.type === "timeZoneName");
  const match = tzPart && tzPart.value.match(/GMT([+-]\d+)/);
  return match ? parseInt(match[1], 10) * 60 : 60; // fallback: CET (+60min)
}

/**
 * Returns { year, month, day, hour, minute } for a UTC instant, expressed
 * in Europe/Paris local time.
 */
function parisPartsForInstant(utcSeconds) {
  const date = new Date(utcSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0; // ICU quirk: midnight can format as "24"
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), hour, minute: Number(map.minute) };
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Returns the epoch seconds (UTC) of 15:00 Europe/Paris time on the given
 * calendar date ("YYYY-MM-DD", interpreted as a Paris-local date), correctly
 * accounting for whichever DST offset applies on that specific date.
 */
function gameDayStartUTC(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Initial guess assuming standard time, then refine using the real offset
  // in effect at that guess (handles the CET/CEST switch automatically).
  const guessUTCms = Date.UTC(y, m - 1, d, RESET_HOUR - 1, 0, 0);
  const offsetMin = parisOffsetMinutesAt(new Date(guessUTCms));
  const preciseUTCms = Date.UTC(y, m - 1, d, RESET_HOUR, 0, 0) - offsetMin * 60 * 1000;
  return Math.floor(preciseUTCms / 1000);
}

/**
 * Returns the game-day identifier ("YYYY-MM-DD") that a given UTC instant
 * falls into: the Paris calendar date of the 15:00 reset that started the
 * current cycle (so anything before 15:00 Paris still belongs to the
 * previous calendar date's game day).
 */
function gameDayForInstant(utcSeconds) {
  const { year, month, day, hour } = parisPartsForInstant(utcSeconds);
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return hour < RESET_HOUR ? addDaysToDateStr(dateStr, -1) : dateStr;
}

/**
 * Returns the game-day identifier for "now" + an offset in game-days
 * (0 = current cycle, 1 = next cycle after the upcoming reset).
 */
function gameDayStr(offsetDays = 0) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const current = gameDayForInstant(nowSeconds);
  return addDaysToDateStr(current, offsetDays);
}

/**
 * Generates the 48 30-minute slots of a game day (15:00 Paris to 15:00
 * Paris the next day), identified by dateStr as returned by gameDayStr().
 */
function generateSlotsForDate(dateStr) {
  const dayStartUTC = gameDayStartUTC(dateStr);
  const slots = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const start_utc = dayStartUTC + i * SLOT_MINUTES * 60;
    const end_utc = start_utc + SLOT_MINUTES * 60;
    const id = `${dateStr}_s${String(i).padStart(2, "0")}`;
    slots.push({ id, date: dateStr, start_utc, end_utc, index: i });
  }
  return slots;
}

function slotsInBlock(slots, block) {
  return slots.slice(block.startIndex, block.endIndex);
}

/**
 * Formats a session's start time as a Discord dynamic timestamp, e.g. 13:00
 * shown in each viewer's own local time.
 */
function formatSlotTime(slot) {
  return `<t:${slot.start_utc}:t>`;
}

function formatSlotLabel(slot) {
  // Static label (per-user localization isn't possible in a select menu),
  // shown in UTC as a universal reference point.
  const d = new Date(slot.start_utc * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

/**
 * Formats a slot's date + time using Discord's own dynamic timestamp
 * styles, so both automatically adapt to each viewer's Discord client
 * language and timezone. Discord's short-date style always includes the
 * year (there's no native "day/month only" style), but it stays numeric
 * and locale-aware, e.g. "17/08/2026" for French clients or "8/17/2026"
 * for US-English ones.
 */
function formatSlotDateTime(slot) {
  return `<t:${slot.start_utc}:d> <t:${slot.start_utc}:t>`;
}

module.exports = {
  SLOT_MINUTES,
  SLOTS_PER_DAY,
  RESET_HOUR,
  BLOCKS,
  gameDayStr,
  gameDayForInstant,
  generateSlotsForDate,
  slotsInBlock,
  formatSlotTime,
  formatSlotLabel,
  formatSlotDateTime,
};
