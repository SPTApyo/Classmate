module.exports = async function handler(args, interaction, { assistant, assistantStore, isAdmin }) {
  const { userId, alias, group, dept, level } = args;
  if (typeof userId !== "string" || !userId) return { error: "A valid userId is required." };

  if (!isAdmin && userId !== interaction.user.id) {
    return { error: "Permission denied: users can only update their own profile.", code: "PERMISSION_DENIED" };
  }

  try {
    const discordUser = await assistant.client.users.fetch(userId).catch(() => null);
    const username = discordUser?.username || userId;
    const user = assistantStore.upsertUser({ userId, username, group, alias, dept, level });
    return { success: true, user };
  } catch (error) {
    assistant.logger.logMessage("[ AI ] [ ERROR ] UpdateUserData failed", error);
    return { success: false, error: error.message };
  }
};
