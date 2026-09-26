module.exports = async function handler(args, interaction, { llmClient, llmDataManager }) {
  const { directive } = args;
  if (typeof directive !== "string" || directive.trim().length < 3) {
    return { error: "Invalid directive: provide at least 3 characters." };
  }

  const success = llmDataManager.addDirective(directive.trim());
  llmClient.directives = llmDataManager.loadDirectivesFromFile();
  llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Directive added by ${interaction.user.username}`);
  return { success, directives: llmClient.directives };
};
