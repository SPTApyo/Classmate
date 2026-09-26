async function handler(interaction, { t, interacting, checkAllGroups }) {
  await interacting.replyToInteraction(interaction, t("check.running"));
  await checkAllGroups();
  await interacting.editInteraction(interaction, t("check.done"));
}

module.exports = handler;
