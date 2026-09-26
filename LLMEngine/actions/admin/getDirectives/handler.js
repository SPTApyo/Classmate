module.exports = async function handler(args, interaction, { llmClient, llmDataManager }) {
  llmClient.directives = llmDataManager.loadDirectivesFromFile();
  return { directives: llmClient.directives, count: llmClient.directives.length };
};
