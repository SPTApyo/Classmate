const { promptGroup, promptDevoir } = require("../../../utilities/DevoirPrompts");

async function handler(interaction, { t, interacting, logger, devoirManager, EmbedFormManager, user }) {
  const form = new EmbedFormManager(interaction, interacting);

  const groupChoice = await promptGroup(form, devoirManager, interaction.id);
  if (!groupChoice) return;
  const { group } = groupChoice;

  const devoirChoice = await promptDevoir(
    form,
    group,
    devoirManager.loadDevoirs(group),
    interaction.id,
    t("delete.selectTitle"),
    groupChoice.interaction,
  );
  if (!devoirChoice) return;
  const { devoir, interaction: selection } = devoirChoice;

  if (!devoirManager.deleteDevoir({ group, id: devoir.id })) {
    return form
      .createEmbed(t("delete.notFound.title"), t("delete.notFound.description", { id: devoir.id, group }), "danger")
      .clearComponents()
      .update(selection);
  }

  logger.logMessage(`[ SUCCESS ] Assignment ${devoir.id} deleted from ${group} by ${user.username}`);
  await form
    .createEmbed(
      t("delete.success.title"),
      t("delete.success.description", { title: devoir.devoir, id: devoir.id, group }),
      "success",
    )
    .clearComponents()
    .update(selection);
}

module.exports = handler;
