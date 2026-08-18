// Everything is computed and stored in UTC. Each player sees the time
// converted automatically to their own local timezone thanks to Discord's
// dynamic timestamps (<t:EPOCH:t>), rendered client-side by the Discord app.

const SLOT_MINUTES = 30;

// Split into 4 blocks of 6h to stay under Discord's 25-option limit per
// select menu (each block = 12 slots of 30 min).
const BLOCKS = [
  { key: "night", label: "🌙 Night (00:00-06:00 UTC)", startHour: 0, endHour: 6 },
  { key: "morning", label: "🌅 Morning (06:00-12:00 UTC)", startHour: 6, endHour: 12 },
  { key: "afternoon", label: "☀️ Afternoon (12:00-18:00 UTC)", startHour: 12, endHour: 18 },
  { key: "evening", label: "🌆 Evening (18:00-00:00 UTC)", startHour: 18, endHour: 24 },
];

/**
 * Returns the date (YYYY-MM-DD, UTC) for today + a day offset.
 */
function dateStrUTC(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Generates the 48 30-minute slots of a given UTC date (YYYY-MM-DD).
 */
function generateSlotsForDate(dateStr) {
  const [y, m, day] = dateStr.split("-").map(Number);
  const slots = [];
  for (let h = 0; h < 24; h++) {
    for (const min of [0, 30]) {
      const startMs = Date.UTC(y, m - 1, day, h, min, 0);
      const start_utc = Math.floor(startMs / 1000);
      const end_utc = start_utc + SLOT_MINUTES * 60;
      const id = `${dateStr}_${String(h).padStart(2, "0")}${String(min).padStart(2, "0")}`;
      slots.push({ id, date: dateStr, start_utc, end_utc, hour: h });
    }
  }
  return slots;
}

function slotsInBlock(slots, block) {
  return slots.filter((s) => s.hour >= block.startHour && s.hour < block.endHour);
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

module.exports = {
  SLOT_MINUTES,
  BLOCKS,
  dateStrUTC,
  generateSlotsForDate,
  slotsInBlock,
  formatSlotTime,
  formatSlotLabel,
};
