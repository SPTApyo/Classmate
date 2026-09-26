const PlanningApi = require("../../../external/schedule/planningApi");

const planningApi = new PlanningApi();

module.exports = async function handler(args, interaction, { llmClient }) {
  const { year, week, dept } = args;
  if (!year || !week || !dept) return { error: "year, week and dept are required." };

  try {
    return { success: true, ...(await planningApi.getFreeRooms({ year, week, dept })) };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] getFreeRooms failed", error);
    return { success: false, error: error.message };
  }
};
