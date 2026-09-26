module.exports = async function handler(args, interaction, { llmClient }) {
  const devoirManager = llmClient.devoirManager;
  const { groupe } = args;

  let groups;
  if (groupe) {
    const group = devoirManager.resolveGroup(groupe);
    if (!group) {
      return { error: `Unknown group: ${groupe}. Available groups: ${devoirManager.getAllGroups().join(", ")}` };
    }
    groups = devoirManager.purgeGroups([group]);
  } else {
    groups = devoirManager.purgeGroups();
  }

  llmClient.logger.logMessage(
    `[ GEMINI ] [ SUCCESS ] Assignments purged (${groups.join(", ")}) by ${interaction.user.username}`,
  );
  return { success: true, purgedGroups: groups };
};
