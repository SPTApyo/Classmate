const MAX_ALIAS_LENGTH = 32;

async function handler(interaction, { t, user, logger, interacting, addUserToLLMData }) {
  const alias = interaction.options.getString("alias").trim();
  if (!alias || alias.length > MAX_ALIAS_LENGTH) {
    return interacting.replyToInteraction(interaction, t("setalias.invalid", { max: MAX_ALIAS_LENGTH }));
  }

  const updated = await addUserToLLMData(user.id, { pseudo: user.username, alias });
  if (!updated) return interacting.replyToInteraction(interaction, t("setalias.error"));

  logger.logMessage(`[ SUCCESS ] Alias updated for ${user.username} (${user.id})`);
  await interacting.replyToInteraction(interaction, t("setalias.success", { alias }));
}

module.exports = handler;
