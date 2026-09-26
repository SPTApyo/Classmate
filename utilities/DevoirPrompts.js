const DevoirManager = require("./DevoirManager");

const MAX_SELECT_OPTIONS = 25;

// Returns { group, interaction } or null.
async function promptGroup(form, devoirManager, idSuffix) {
  const { t } = form;
  const groups = devoirManager.getAllGroups();
  if (groups.length === 0) {
    await form.createEmbed(t("common.error.title"), t("common.noGroups"), "danger").send();
    return null;
  }

  const selectId = `select_group_${idSuffix}`;
  await form
    .createEmbed(t("prompts.selectGroup.title"), t("prompts.selectGroup.description"), "info")
    .addDropdown(
      selectId,
      t("prompts.selectGroup.placeholder"),
      groups.map((g) => ({ label: g, value: g })),
    )
    .send();

  const selection = await form.awaitComponent(selectId);
  if (!selection) {
    await form.showTimeout();
    return null;
  }
  return { group: selection.values[0], interaction: selection };
}

// Lists the 25 soonest assignments; null on timeout.
async function promptDevoir(form, group, devoirs, idSuffix, title, previousInteraction) {
  const { t } = form;
  if (devoirs.length === 0) {
    await form
      .createEmbed(t("prompts.noDevoir.title"), t("prompts.noDevoir.description", { group }), "danger")
      .clearComponents()
      .update(previousInteraction);
    return null;
  }

  const selectId = `select_devoir_${idSuffix}`;
  const truncated =
    devoirs.length > MAX_SELECT_OPTIONS
      ? `\n\n${t("prompts.selectDevoir.truncated", { max: MAX_SELECT_OPTIONS, total: devoirs.length })}`
      : "";
  const options = [...devoirs].sort(DevoirManager.byDueDate).map((d) => ({
    label: `${d.id}. ${d.devoir}`,
    description: `${d.matiere} - ${d.date}`,
    value: String(d.id),
  }));

  await form
    .createEmbed(title, `${t("prompts.selectDevoir.description", { group })}${truncated}`, "info")
    .clearComponents()
    .addDropdown(selectId, t("prompts.selectDevoir.placeholder"), options)
    .update(previousInteraction);

  const selection = await form.awaitComponent(selectId);
  if (!selection) {
    await form.showTimeout();
    return null;
  }
  return { devoir: devoirs.find((d) => d.id === Number(selection.values[0])), interaction: selection };
}

module.exports = { promptGroup, promptDevoir };
