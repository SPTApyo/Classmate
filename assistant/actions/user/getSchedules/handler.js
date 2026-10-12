const TimetableApi = require("../../../../utilities/TimetableApi");

const timetableApi = new TimetableApi();

module.exports = async function handler(args, interaction, { assistant }) {
  const { year, week, dept, level, group } = args;
  if (!year || !week || !dept || !level || !group) {
    return { error: "year, week, dept, level and group are required." };
  }

  try {
    const schedule = await timetableApi.getSchedules({ year, week, dept, level, group });
    return { success: true, schedule };
  } catch (error) {
    assistant.logger.logMessage("[ AI ] [ ERROR ] getSchedules failed", error);
    return { success: false, error: error.message };
  }
};
