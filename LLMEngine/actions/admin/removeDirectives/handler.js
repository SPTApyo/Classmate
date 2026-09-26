module.exports = async function handler(args, interaction, { llmClient, llmDataManager }) {
  const index = Number(args.index);
  const { success, existed } = llmDataManager.removeDirective(index);
  llmClient.directives = llmDataManager.loadDirectivesFromFile();

  if (!existed) {
    return { success: false, error: `No directive at index ${args.index}.`, directives: llmClient.directives };
  }
  llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Directive ${index} removed by ${interaction.user.username}`);
  return { success, directives: llmClient.directives };
};
