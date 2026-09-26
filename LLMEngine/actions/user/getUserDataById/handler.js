module.exports = async function handler(args, interaction, { llmDataManager }) {
  if (!args.userId) return { error: "userId is required." };
  return { user: llmDataManager.getUserById(args.userId) };
};
