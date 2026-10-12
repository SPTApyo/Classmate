module.exports = async function handler(args, interaction, { assistant, assistantStore }) {
  const { directive } = args;
  if (typeof directive !== "string" || directive.trim().length < 3) {
    return { error: "Invalid directive: provide at least 3 characters." };
  }

  const success = assistantStore.addDirective(directive.trim());
  assistant.directives = assistantStore.loadDirectivesFromFile();
  assistant.logger.logMessage(`[ AI ] [ SUCCESS ] Directive added by ${interaction.user.username}`);
  return { success, directives: assistant.directives };
};
