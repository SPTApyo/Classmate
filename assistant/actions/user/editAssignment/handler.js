const moment = require("moment");
const AssignmentManager = require("../../../../utilities/AssignmentManager");

module.exports = async function handler(args, interaction, { assistant }) {
  const assignmentManager = assistant.assignmentManager;
  const { id, group, newTitle, newSubject, newDate } = args;

  // Id 0 is valid: no falsy check.
  if (!group || id === undefined || id === null || !Number.isInteger(Number(id))) {
    return { error: "group and an integer id are required." };
  }
  if (newDate && !moment(newDate, AssignmentManager.DATE_FORMAT, true).isValid()) {
    return { error: "Invalid date: use the YYYY-MM-DD format." };
  }
  const resolvedGroup = assignmentManager.resolveGroup(group);
  if (!resolvedGroup) {
    return { error: `Unknown group: ${group}. Available groups: ${assignmentManager.getAllGroups().join(", ")}` };
  }

  const assignments = assignmentManager.loadAssignments(resolvedGroup);
  const target = assignments.find((d) => d.id === Number(id));
  if (!target) return { error: `No assignment with ID ${id} in group ${resolvedGroup}.` };

  if (newTitle) target.title = newTitle;
  if (newSubject) target.subject = newSubject;
  if (newDate) target.date = newDate;
  assignmentManager.saveAssignments(resolvedGroup, assignments);
  assignmentManager.removeExpired();
  assignmentManager.sortAssignments();

  assistant.logger.logMessage(
    `[ AI ] [ SUCCESS ] Assignment ${id} updated in ${resolvedGroup} by ${interaction.user.username}`,
  );
  return { success: true, assignment: target };
};
