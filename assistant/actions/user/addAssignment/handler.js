const moment = require("moment");
const AssignmentManager = require("../../../../utilities/AssignmentManager");

module.exports = async function handler(args, interaction, { assistant }) {
  const assignmentManager = assistant.assignmentManager;
  const { group, title, subject, date } = args;

  if (!group || !title || !subject || !date) {
    return { error: "Missing parameters: group, title, subject and date are required." };
  }
  if (!moment(date, AssignmentManager.DATE_FORMAT, true).isValid()) {
    return { error: "Invalid date: use the YYYY-MM-DD format." };
  }
  const resolvedGroup = assignmentManager.resolveGroup(group);
  if (!resolvedGroup) {
    return { error: `Unknown group: ${group}. Available groups: ${assignmentManager.getAllGroups().join(", ")}` };
  }

  const addedBy = interaction.user.username;
  const { assignment, created } = assignmentManager.addAssignment({
    group: resolvedGroup,
    title,
    subject,
    date,
    addedBy,
  });
  assignmentManager.removeExpired();
  assignmentManager.sortAssignments();

  assistant.logger.logMessage(
    `[ AI ] [ SUCCESS ] Assignment ${created ? "added to" : "updated in"} ${resolvedGroup} by ${addedBy}`,
  );
  return { success: true, created, assignment };
};
