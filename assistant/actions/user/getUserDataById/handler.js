module.exports = async function handler(args, interaction, { assistantStore }) {
  if (!args.userId) return { error: "userId is required." };
  return { user: assistantStore.getUserById(args.userId) };
};
