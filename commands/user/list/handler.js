const LIST_TIMEOUT_MS = 2 * 60 * 1000;

function formatDevoirs(t, devoirs) {
  if (devoirs.length === 0) return t("list.empty");
  return devoirs
    .map((d) =>
      t("list.item", { id: d.id, title: d.devoir, subject: d.matiere, date: d.date, addedBy: d.addedBy || "?" }),
    )
    .join("\n\n");
}

async function handler(interaction, { t, interacting, devoirManager, EmbedFormManager }) {
  const groups = devoirManager.getAllGroups();
  if (groups.length === 0) return interacting.replyToInteraction(interaction, t("common.noGroups"));

  const form = new EmbedFormManager(interaction, interacting);
  const selectId = `select_group_${interaction.id}`;
  const options = groups.map((g) => ({ label: g, value: g }));

  await form
    .createEmbed(t("prompts.selectGroup.title"), t("prompts.selectGroup.description"), "info")
    .addDropdown(selectId, t("prompts.selectGroup.placeholder"), options)
    .send();

  let hasSelected = false;
  let selection;
  while ((selection = await form.awaitComponent(selectId, LIST_TIMEOUT_MS))) {
    hasSelected = true;
    const group = selection.values[0];
    await form
      .createEmbed(t("list.title", { group }), formatDevoirs(t, devoirManager.loadDevoirs(group)), "info")
      .clearComponents()
      .addDropdown(selectId, t("prompts.selectGroup.placeholder"), options)
      .update(selection);
  }

  if (!hasSelected) return form.showTimeout(t("list.noSelection"));
  await form.clearComponents().update();
}

module.exports = handler;
