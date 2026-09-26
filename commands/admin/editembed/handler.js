const { EmbedBuilder } = require("discord.js");

// Slash options cannot contain newlines; accept "\n".
const unescapeNewlines = (text) => text.replace(/\\n/g, "\n");

async function handler(interaction, { t, interacting, logger, client }) {
  const channelId = interaction.options.getString("channel_id");
  const messageId = interaction.options.getString("message_id");
  const title = interaction.options.getString("title");
  const description = interaction.options.getString("description");
  const content = interaction.options.getString("message");

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return interacting.replyToInteraction(interaction, t("common.channelNotFound"));

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return interacting.replyToInteraction(interaction, t("editembed.messageNotFound"));
  if (!message.embeds.length) return interacting.replyToInteraction(interaction, t("editembed.noEmbed"));

  const embed = new EmbedBuilder(message.embeds[0].data);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(unescapeNewlines(description));

  try {
    await message.edit({ content: content ? unescapeNewlines(content) : message.content, embeds: [embed] });
    await interacting.replyToInteraction(interaction, t("editembed.success"));
  } catch (error) {
    logger.logMessage("[ ERROR ] /editembed failed", error);
    await interacting.replyToInteraction(interaction, t("editembed.error"));
  }
}

module.exports = handler;
