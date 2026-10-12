const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const FLOOR_COLORS = ["2ecc71", "e67e22", "e74c3c", "9b59b6", "3498db"];
const OTHER_COLOR = "95a5a6";

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function parseSlot(label) {
  const match = label.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

async function handler(interaction, { t, user, logger, interacting, TimetableApi, settings }) {
  try {
    const now = new Date();
    const { rooms } = await new TimetableApi().getFreeRooms({
      year: now.getFullYear(),
      week: getWeekNumber(now),
      dept: settings.get().planning?.defaultDept,
    });
    const slots = rooms[DAY_KEYS[now.getDay()]];
    if (!slots || Object.keys(slots).length === 0) {
      return interacting.replyToInteraction(interaction, t("getroom.noData"));
    }

    const slotTimes = Object.keys(slots)
      .map((label) => ({ label, minutes: parseSlot(label) }))
      .filter((slot) => slot.minutes !== null);
    if (slotTimes.length === 0) return interacting.replyToInteraction(interaction, t("getroom.noSlot"));

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const closest = slotTimes.reduce((best, slot) =>
      Math.abs(slot.minutes - nowMinutes) < Math.abs(best.minutes - nowMinutes) ? slot : best,
    );

    const embeds = Object.entries(slots[closest.label])
      .filter(([, list]) => list.length > 0)
      .map(([floor, list]) => {
        if (floor === "other") return interacting.createEmbed(t("getroom.floor.other"), list.join(", "), OTHER_COLOR);
        const title = floor === "0" ? t("getroom.floor.ground") : t("getroom.floor.numbered", { floor });
        return interacting.createEmbed(title, list.join(", "), FLOOR_COLORS[Number(floor) % FLOOR_COLORS.length]);
      });
    if (embeds.length === 0) {
      return interacting.replyToInteraction(interaction, t("getroom.noRoom", { slot: closest.label }));
    }

    await interacting.replyToInteraction(interaction, t("getroom.header", { slot: closest.label }), embeds);
    logger.logMessage(`[ SUCCESS ] Free rooms sent to ${user.username} for slot ${closest.label}`);
  } catch (err) {
    logger.logMessage("[ ERROR ] /getroom failed", err);
    await interacting.replyToInteraction(interaction, t("getroom.error"));
  }
}

module.exports = handler;
