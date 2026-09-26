const { PermissionsBitField } = require("discord.js");

const REQUIRED_PERMISSIONS = [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks];

async function handler(interaction, { t, interacting, logger, client, settings }) {
  const channelId = interaction.options.getString("channel_id");
  const channelOption = interaction.options.getChannel("channel");
  const title = interaction.options.getString("title");
  const description = interaction.options.getString("description");
  const content = interaction.options.getString("message");

  if (!channelId && !channelOption) return interacting.replyToInteraction(interaction, t("sendembed.missingChannel"));

  const channel = channelOption || (await client.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) return interacting.replyToInteraction(interaction, t("common.channelNotFound"));
  if (!channel.permissionsFor(client.user)?.has(REQUIRED_PERMISSIONS)) {
    return interacting.replyToInteraction(interaction, t("sendembed.noPermission"));
  }

  try {
    const embed = interacting.createEmbed(
      title,
      description.replace(/\\n/g, "\n"),
      settings.get().appearance.embedGlobalColor,
    );
    await channel.send({ ...(content ? { content } : {}), embeds: [embed] });
    await interacting.replyToInteraction(interaction, t("sendembed.success"));
  } catch (error) {
    logger.logMessage("[ ERROR ] /sendembed failed", error);
    await interacting.replyToInteraction(interaction, t("sendembed.error"));
  }
}

module.exports = handler;
