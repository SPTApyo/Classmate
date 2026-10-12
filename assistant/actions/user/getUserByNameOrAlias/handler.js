module.exports = async function handler(args, interaction, { assistantStore }) {
  if (!args.value) return { error: "value is required." };
  return { user: assistantStore.getUserByNameOrAlias(args.value) };
};
