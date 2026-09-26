module.exports = async function handler(args, interaction, { llmClient }) {
  return { devoirs: llmClient.devoirManager.getAllDevoirsGrouped() };
};
