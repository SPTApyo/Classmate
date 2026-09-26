// AI output must never ping everyone or roles.
const ALLOWED_MENTIONS = { parse: ["users"] };
const DEFAULT_EMBED_COLOR = 0x3498db;

module.exports = async function handler(args, interaction, { llmClient }) {
  const { channelId, message, isEmbed, embedOptions } = args;
  if (!channelId || !message) return { error: "The channel ID and the message are required." };

  try {
    const channel = await llmClient.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return { error: "Channel not found or not a text channel." };

    if (isEmbed && embedOptions) {
      const embed = {
        title: embedOptions.title || undefined,
        description: embedOptions.description || message,
        color: embedOptions.color || DEFAULT_EMBED_COLOR,
        image: embedOptions.imageUrl ? { url: embedOptions.imageUrl } : undefined,
        footer: embedOptions.footer ? { text: embedOptions.footer } : undefined,
      };
      await channel.send({ embeds: [embed], allowedMentions: ALLOWED_MENTIONS });
    } else {
      await channel.send({ content: message, allowedMentions: ALLOWED_MENTIONS });
    }

    llmClient.logger.logMessage(`[ GEMINI ] [ SUCCESS ] Message sent to ${channelId} by ${interaction.user.username}`);
    return { success: true };
  } catch (error) {
    llmClient.logger.logMessage("[ GEMINI ] [ ERROR ] sendMessage failed", error);
    return { success: false, error: error.message };
  }
};
