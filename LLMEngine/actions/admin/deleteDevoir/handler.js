module.exports = async function handler(args, interaction, { llmClient }) {
  const devoirManager = llmClient.devoirManager;
  const { group, id } = args;

  // Id 0 is valid: no falsy check.
  if (!group || id === undefined || id === null || !Number.isInteger(Number(id))) {
    return { error: "A group name and an integer assignment ID are required." };
  }
  const resolvedGroup = devoirManager.resolveGroup(group);
  if (!resolvedGroup) {
    return { error: `Unknown group: ${group}. Available groups: ${devoirManager.getAllGroups().join(", ")}` };
  }

  const deleted = devoirManager.deleteDevoir({ group: resolvedGroup, id: Number(id) });
  if (!deleted) return { success: false, error: `No assignment with ID ${id} in group ${resolvedGroup}.` };

  llmClient.logger.logMessage(
    `[ GEMINI ] [ SUCCESS ] Assignment ${id} deleted from ${resolvedGroup} by ${interaction.user.username}`,
  );
  return { success: true, group: resolvedGroup, deletedId: Number(id) };
};
