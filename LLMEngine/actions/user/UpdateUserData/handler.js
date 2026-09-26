module.exports = async function handler(args, interaction, { llmClient, llmDataManager, isAdmin }) {
  const { userId, alias, group, dept, train_prog } = args;
  if (typeof userId !== "string" || !userId) return { error: "A valid userId is required." };

  if (!isAdmin && userId !== interaction.user.id) {
    return { error: "Permission denied: users can only update their own profile.", code: "PERMISSION_DENIED" };
  }

  try {
    const discordUser = await llmClient.client.users.fetch(userId).catch(() => null);
    const pseudo = discordUser?.username || userId;
    const user = llmDataManager.upsertUser({ userId, pseudo, group, alias, dept, train_prog });
    return { success: true, user };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] UpdateUserData failed", error);
    return { success: false, error: error.message };
  }
};
