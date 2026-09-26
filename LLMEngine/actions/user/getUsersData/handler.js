module.exports = async function handler(args, interaction, { llmDataManager }) {
  return { users: llmDataManager.loadUsers() };
};
