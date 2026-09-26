const MAX_FETCH = 100;

module.exports = async function handler(args, interaction, { llmClient }) {
  const { channelId, filter, limit = MAX_FETCH } = args;
  if (!channelId) return { error: "The channel ID is required." };

  try {
    const channel = await llmClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return { error: "Channel not found or not a text channel." };

    const fetchLimit = Math.min(Math.max(Number(limit) || MAX_FETCH, 1), MAX_FETCH);
    const messages = await channel.messages.fetch({ limit: fetchLimit });
    const toDelete = [...messages.values()].filter(
      (msg) => typeof filter !== "string" || msg.content.includes(filter) || msg.author?.username.includes(filter),
    );
    const results = await Promise.all(
      toDelete.map((msg) =>
        msg.delete().then(
          () => true,
          () => false,
        ),
      ),
    );
    const deletedCount = results.filter(Boolean).length;

    llmClient.logger.logMessage(
      `[ GEMINI ] [ SUCCESS ] ${deletedCount} message(s) deleted in ${channelId} by ${interaction.user.username}`,
    );
    return { success: true, deletedCount };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] purgeChannel failed", error);
    return { success: false, error: error.message };
  }
};
