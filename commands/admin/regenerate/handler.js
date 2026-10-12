async function handler(interaction, { t, interacting, logger, assignmentManager, user }) {
  try {
    assignmentManager.regenerateIds();
    logger.logMessage(`[ SUCCESS ] Assignment IDs renumbered by ${user.username}`);
    await interacting.replyToInteraction(interaction, t("regenerate.success"));
  } catch (error) {
    logger.logMessage("[ ERROR ] /regenerate failed", error);
    await interacting.replyToInteraction(interaction, t("regenerate.error"));
  }
}

module.exports = handler;
