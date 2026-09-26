const PlanningApi = require("../../../external/schedule/planningApi");

const planningApi = new PlanningApi();

module.exports = async function handler(args, interaction, { llmClient }) {
  const { year, week, dept, train_prog, groupe } = args;
  if (!year || !week || !dept || !train_prog || !groupe) {
    return { error: "year, week, dept, train_prog and groupe are required." };
  }

  try {
    const schedule = await planningApi.getSchedules({ year, week, dept, train_prog, groupe });
    return { success: true, schedule };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] getSchedules failed", error);
    return { success: false, error: error.message };
  }
};
