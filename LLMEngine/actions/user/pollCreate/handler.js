const MIN_ANSWERS = 2;
const MAX_ANSWERS = 10;

module.exports = async function handler(args, interaction, { llmClient }) {
  const { channelId, question, options, durationHour = 1, allow_multiselect = false } = args;
  if (!channelId || typeof question !== "string" || !question.trim() || !Array.isArray(options)) {
    return { error: "channelId, question and options are required." };
  }

  const answers = options.filter((opt) => typeof opt === "string" && opt.trim()).slice(0, MAX_ANSWERS);
  if (answers.length < MIN_ANSWERS) return { error: "A poll needs at least two non-empty answers." };

  try {
    const channel = await llmClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return { error: "Channel not found or not a text channel." };

    await channel.send({
      poll: {
        question: { text: question },
        answers: answers.map((text) => ({ text })),
        duration: Math.max(1, Number(durationHour) || 1),
        allowMultiselect: !!allow_multiselect,
      },
    });
    llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Poll created in ${channelId} by ${interaction.user.username}`);
    return { success: true };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] pollCreate failed", error);
    return { success: false, error: error.message };
  }
};
