module.exports = async function handler(args, interaction, { assistant }) {
  assistant.assignmentManager.regenerateIds();
  assistant.logger.logMessage(`[ AI ] [ SUCCESS ] Assignment IDs renumbered by ${interaction.user.username}`);
  return { success: true };
};
