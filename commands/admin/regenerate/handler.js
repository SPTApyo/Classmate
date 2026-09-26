async function handler(interaction, { t, interacting, logger, devoirManager, user }) {
  try {
    devoirManager.regenerateIds();
    logger.logMessage(`[ SUCCESS ] Assignment IDs renumbered by ${user.username}`);
    await interacting.replyToInteraction(interaction, t("regenerate.success"));
  } catch (error) {
    logger.logMessage("[ ERROR ] /regenerate failed", error);
    await interacting.replyToInteraction(interaction, t("regenerate.error"));
  }
}

module.exports = handler;
