module.exports = async function handler(args, interaction, { assistant, assistantStore }) {
  const index = Number(args.index);
  const { success, existed } = assistantStore.removeDirective(index);
  assistant.directives = assistantStore.loadDirectivesFromFile();

  if (!existed) {
    return { success: false, error: `No directive at index ${args.index}.`, directives: assistant.directives };
  }
  assistant.logger.logMessage(`[ AI ] [ SUCCESS ] Directive ${index} removed by ${interaction.user.username}`);
  return { success, directives: assistant.directives };
};
