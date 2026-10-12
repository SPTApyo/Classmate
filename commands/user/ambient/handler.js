async function handler(interaction, { t, interacting, logger, assistantStore, user }) {
  const optOut = !assistantStore.isAmbientOptOut(user.id);
  assistantStore.setAmbientOptOut(user.id, optOut);
  logger.logMessage(`[ AMBIENT ] ${user.username} ${optOut ? "opted out of" : "opted back into"} ambient mode`);
  await interacting.replyToInteraction(interaction, t(optOut ? "ambient.optedOut" : "ambient.optedIn"));
}

module.exports = handler;
