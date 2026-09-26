const { ButtonStyle } = require("discord.js");

const CONFIRM_TIMEOUT_MS = 15000;
const SHUTDOWN_DELAY_MS = 2000;

async function handler(interaction, { t, interacting, logger, user, EmbedFormManager, shutdown }) {
  const form = new EmbedFormManager(interaction, interacting);
  const confirmId = `confirm_kill_${interaction.id}`;
  const cancelId = `cancel_kill_${interaction.id}`;

  await form
    .createEmbed(t("kill.confirm.title"), t("kill.confirm.description"), "danger")
    .addButtons([
      { customId: confirmId, label: t("common.confirm"), style: ButtonStyle.Danger },
      { customId: cancelId, label: t("common.cancel"), style: ButtonStyle.Secondary },
    ])
    .send();

  const choice = await form.awaitComponent([confirmId, cancelId], CONFIRM_TIMEOUT_MS);
  if (!choice) return form.showTimeout();

  if (choice.customId === cancelId) {
    return form
      .createEmbed(t("kill.cancelled.title"), t("kill.cancelled.description"), "success")
      .clearComponents()
      .update(choice);
  }

  logger.logMessage(`[ NOTICE ] Shutdown requested by ${user.username}`);
  await form
    .createEmbed(t("kill.stopping.title"), t("kill.stopping.description"), "info")
    .clearComponents()
    .update(choice);
  setTimeout(() => shutdown(`/kill by ${user.username}`), SHUTDOWN_DELAY_MS);
}

module.exports = handler;
