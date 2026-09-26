module.exports = async function handler(args, interaction, { llmClient, llmDataManager }) {
  const success = llmDataManager.saveDirectivesToFile([]);
  llmClient.directives = llmDataManager.loadDirectivesFromFile();
  llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Directives purged by ${interaction.user.username}`);
  return { success, directives: llmClient.directives };
};
