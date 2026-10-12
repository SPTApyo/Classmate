module.exports = async function handler(args, interaction, { assistant }) {
  const assignmentManager = assistant.assignmentManager;
  const { group } = args;

  let groups;
  if (group) {
    const resolvedGroup = assignmentManager.resolveGroup(group);
    if (!resolvedGroup) {
      return { error: `Unknown group: ${group}. Available groups: ${assignmentManager.getAllGroups().join(", ")}` };
    }
    groups = assignmentManager.purgeGroups([resolvedGroup]);
  } else {
    groups = assignmentManager.purgeGroups();
  }

  assistant.logger.logMessage(
    `[ AI ] [ SUCCESS ] Assignments purged (${groups.join(", ")}) by ${interaction.user.username}`,
  );
  return { success: true, purgedGroups: groups };
};
