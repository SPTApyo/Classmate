async function handler(interaction, { t, interacting, logger, settings, user }) {
  try {
    const current = settings.reload();
    logger.logMessage(`[ SUCCESS ] settings.json reloaded by ${user.username}`);
    await interacting.replyToInteraction(
      interaction,
      t("reload.success", { groups: current.tasks.length, locale: current.defaultLocale }),
    );
  } catch (error) {
    logger.logMessage("[ ERROR ] /reload rejected settings.json", error);
    await interacting.replyToInteraction(interaction, t("reload.error", { message: error.message }));
  }
}

module.exports = handler;
