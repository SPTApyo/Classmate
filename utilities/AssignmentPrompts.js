const AssignmentManager = require("./AssignmentManager");

const MAX_SELECT_OPTIONS = 25;

// Returns { group, interaction } or null.
async function promptGroup(form, assignmentManager, idSuffix) {
  const { t } = form;
  const groups = assignmentManager.getAllGroups();
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
async function promptAssignment(form, group, assignments, idSuffix, title, previousInteraction) {
  const { t } = form;
  if (assignments.length === 0) {
    await form
      .createEmbed(t("prompts.noAssignment.title"), t("prompts.noAssignment.description", { group }), "danger")
      .clearComponents()
      .update(previousInteraction);
    return null;
  }

  const selectId = `select_assignment_${idSuffix}`;
  const truncated =
    assignments.length > MAX_SELECT_OPTIONS
      ? `\n\n${t("prompts.selectAssignment.truncated", { max: MAX_SELECT_OPTIONS, total: assignments.length })}`
      : "";
  const options = [...assignments].sort(AssignmentManager.byDueDate).map((d) => ({
    label: `${d.id}. ${d.title}`,
    description: `${d.subject} - ${d.date}`,
    value: String(d.id),
  }));

  await form
    .createEmbed(title, `${t("prompts.selectAssignment.description", { group })}${truncated}`, "info")
    .clearComponents()
    .addDropdown(selectId, t("prompts.selectAssignment.placeholder"), options)
    .update(previousInteraction);

  const selection = await form.awaitComponent(selectId);
  if (!selection) {
    await form.showTimeout();
    return null;
  }
  return { assignment: assignments.find((d) => d.id === Number(selection.values[0])), interaction: selection };
}

module.exports = { promptGroup, promptAssignment };
