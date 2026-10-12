async function handler(interaction, { t, interacting, logger, assignmentManager }) {
  try {
    assignmentManager.sortAssignments();
    await interacting.replyToInteraction(interaction, t("sort.success"));
  } catch (error) {
    logger.logMessage("[ ERROR ] /sort failed", error);
    await interacting.replyToInteraction(interaction, t("sort.error"));
  }
}

module.exports = handler;
