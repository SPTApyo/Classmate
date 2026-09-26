const moment = require("moment");
const DevoirManager = require("../../../../utilities/DevoirManager");

module.exports = async function handler(args, interaction, { llmClient }) {
  const devoirManager = llmClient.devoirManager;
  const { groupe, devoir, matiere, date } = args;

  if (!groupe || !devoir || !matiere || !date) {
    return { error: "Missing parameters: groupe, devoir, matiere and date are required." };
  }
  if (!moment(date, DevoirManager.DATE_FORMAT, true).isValid()) {
    return { error: "Invalid date: use the DD-MM-YYYY format." };
  }
  const group = devoirManager.resolveGroup(groupe);
  if (!group) {
    return { error: `Unknown group: ${groupe}. Available groups: ${devoirManager.getAllGroups().join(", ")}` };
  }

  const addedBy = interaction.user.username;
  const { devoir: saved, created } = devoirManager.addDevoir({ group, devoir, matiere, date, addedBy });
  devoirManager.removeExpiredDevoirs();
  devoirManager.sortDevoirs();

  llmClient.logger.logMessage(
    `[ GEMINI ] [ SUCCESS ] Assignment ${created ? "added to" : "updated in"} ${group} by ${addedBy}`,
  );
  return { success: true, created, devoir: saved };
};
