module.exports = async function handler(args, interaction, { llmClient }) {
  llmClient.devoirManager.regenerateIds();
  llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Assignment IDs renumbered by ${interaction.user.username}`);
  return { success: true };
};
