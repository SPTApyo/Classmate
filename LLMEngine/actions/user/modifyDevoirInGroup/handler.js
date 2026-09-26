const moment = require("moment");
const DevoirManager = require("../../../../utilities/DevoirManager");

module.exports = async function handler(args, interaction, { llmClient }) {
  const devoirManager = llmClient.devoirManager;
  const { id, groupe, newDevoir, newMatiere, newDate } = args;

  // Id 0 is valid: no falsy check.
  if (!groupe || id === undefined || id === null || !Number.isInteger(Number(id))) {
    return { error: "groupe and an integer id are required." };
  }
  if (newDate && !moment(newDate, DevoirManager.DATE_FORMAT, true).isValid()) {
    return { error: "Invalid date: use the DD-MM-YYYY format." };
  }
  const group = devoirManager.resolveGroup(groupe);
  if (!group) {
    return { error: `Unknown group: ${groupe}. Available groups: ${devoirManager.getAllGroups().join(", ")}` };
  }

  const devoirs = devoirManager.loadDevoirs(group);
  const target = devoirs.find((d) => d.id === Number(id));
  if (!target) return { error: `No assignment with ID ${id} in group ${group}.` };

  if (newDevoir) target.devoir = newDevoir;
  if (newMatiere) target.matiere = newMatiere;
  if (newDate) target.date = newDate;
  devoirManager.saveDevoirsForGroup(group, devoirs);
  devoirManager.removeExpiredDevoirs();
  devoirManager.sortDevoirs();

  llmClient.logger.logMessage(
    `[ GEMINI ] [ SUCCESS ] Assignment ${id} updated in ${group} by ${interaction.user.username}`,
  );
  return { success: true, devoir: target };
};
