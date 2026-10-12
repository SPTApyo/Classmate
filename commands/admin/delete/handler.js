const { promptGroup, promptAssignment } = require("../../../utilities/AssignmentPrompts");

async function handler(interaction, { t, interacting, logger, assignmentManager, EmbedFormManager, user }) {
  const form = new EmbedFormManager(interaction, interacting);

  const groupChoice = await promptGroup(form, assignmentManager, interaction.id);
  if (!groupChoice) return;
  const { group } = groupChoice;

  const assignmentChoice = await promptAssignment(
    form,
    group,
    assignmentManager.loadAssignments(group),
    interaction.id,
    t("delete.selectTitle"),
    groupChoice.interaction,
  );
  if (!assignmentChoice) return;
  const { assignment, interaction: selection } = assignmentChoice;

  if (!assignmentManager.deleteAssignment({ group, id: assignment.id })) {
    return form
      .createEmbed(t("delete.notFound.title"), t("delete.notFound.description", { id: assignment.id, group }), "danger")
      .clearComponents()
      .update(selection);
  }

  logger.logMessage(`[ SUCCESS ] Assignment ${assignment.id} deleted from ${group} by ${user.username}`);
  await form
    .createEmbed(
      t("delete.success.title"),
      t("delete.success.description", { title: assignment.title, id: assignment.id, group }),
      "success",
    )
    .clearComponents()
    .update(selection);
}

module.exports = handler;
