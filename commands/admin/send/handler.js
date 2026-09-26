const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

const MODAL_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 2000;

async function handler(interaction, { t, interacting, logger, client, user, EmbedFormManager }) {
  const modalId = `send_modal_${interaction.id}`;
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(t("send.modal.title"))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel(t("send.modal.content"))
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(MAX_MESSAGE_LENGTH)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);

  const submit = await interaction
    .awaitModalSubmit({
      filter: (s) => s.customId === modalId && s.user.id === interaction.user.id,
      time: MODAL_TIMEOUT_MS,
    })
    .catch(() => null);
  if (!submit) return;
  const content = submit.fields.getTextInputValue("content");

  const form = new EmbedFormManager(submit, interacting);
  const channelSelectId = `send_channel_${interaction.id}`;
  await form
    .createEmbed(t("send.selectChannel.title"), t("send.selectChannel.description"), "info")
    .addRow(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(channelSelectId)
          .setPlaceholder(t("send.selectChannel.placeholder"))
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
    )
    .send();

  const selection = await form.awaitComponent(channelSelectId);
  if (!selection) return form.showTimeout();

  const channel = selection.channels.first();
  if (!channel?.permissionsFor(client.user)?.has(PermissionsBitField.Flags.SendMessages)) {
    return form
      .createEmbed(t("common.error.title"), t("send.noPermission"), "danger")
      .clearComponents()
      .update(selection);
  }

  await channel.send(content);
  logger.logMessage(`[ SUCCESS ] Message sent to #${channel.name} by ${user.username}`);
  await form
    .createEmbed(t("send.success.title"), t("send.success.description", { channel: `${channel}` }), "success")
    .clearComponents()
    .update(selection);
}

module.exports = handler;
