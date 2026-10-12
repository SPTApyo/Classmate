module.exports = async function handler(args, interaction, { assistantStore }) {
  return { users: assistantStore.loadUsers() };
};
