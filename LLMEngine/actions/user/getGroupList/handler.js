module.exports = async function handler(args, interaction, { llmClient }) {
  return { groups: llmClient.devoirManager.getAllGroups() };
};
