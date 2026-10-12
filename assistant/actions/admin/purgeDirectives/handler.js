module.exports = async function handler(args, interaction, { assistant, assistantStore }) {
  const success = assistantStore.saveDirectivesToFile([]);
  assistant.directives = assistantStore.loadDirectivesFromFile();
  assistant.logger.logMessage(`[ AI ] [ SUCCESS ] Directives purged by ${interaction.user.username}`);
  return { success, directives: assistant.directives };
};
