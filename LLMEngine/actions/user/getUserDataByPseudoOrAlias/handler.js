module.exports = async function handler(args, interaction, { llmDataManager }) {
  if (!args.value) return { error: "value is required." };
  return { user: llmDataManager.getUserByPseudoOrAlias(args.value) };
};
