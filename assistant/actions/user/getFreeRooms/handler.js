const TimetableApi = require("../../../../utilities/TimetableApi");

const timetableApi = new TimetableApi();

module.exports = async function handler(args, interaction, { assistant }) {
  const { year, week, dept } = args;
  if (!year || !week || !dept) return { error: "year, week and dept are required." };

  try {
    return { success: true, ...(await timetableApi.getFreeRooms({ year, week, dept })) };
  } catch (error) {
    assistant.logger.logMessage("[ AI ] [ ERROR ] getFreeRooms failed", error);
    return { success: false, error: error.message };
  }
};
