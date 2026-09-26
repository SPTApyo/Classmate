const { sendDM } = require("../../../utilities/dm");

// Discord cannot tell whether DMs are open.
async function handler(interaction, { t, client, logger, interacting, llmDataManager, devoirManager, user }) {
  const profile = llmDataManager.getUserById(user.id);
  if (profile?.dmReminders) {
    llmDataManager.setUserField(user.id, "dmReminders", false);
    logger.logMessage(`[ NOTICE ] ${user.username} unsubscribed from DM reminders`);
    return interacting.replyToInteraction(interaction, t("dmReminders.disabled"));
  }

  const group = devoirManager.resolveGroup(profile?.group);
  if (!group) return interacting.replyToInteraction(interaction, t("dmReminders.noGroup"));

  await interacting.replyToInteraction(interaction, t("dmReminders.checking"));
  const result = await sendDM(client, user.id, { content: t("dmReminders.welcome", { group }) });
  if (!result.ok) {
    logger.logMessage(`[ NOTICE ] DM reminders refused for ${user.username}: DMs unavailable`);
    return interacting.editInteraction(interaction, t(result.closed ? "dmReminders.closed" : "dmReminders.failed"));
  }

  llmDataManager.setUserField(user.id, "dmReminders", true);
  logger.logMessage(`[ SUCCESS ] ${user.username} subscribed to DM reminders for ${group}`);
  await interacting.editInteraction(interaction, t("dmReminders.enabled", { group }));
}

module.exports = handler;
