module.exports = async function handler(args, interaction, { assistant, assistantStore }) {
  assistant.directives = assistantStore.loadDirectivesFromFile();
  return { directives: assistant.directives, count: assistant.directives.length };
};
