const AssignmentManager = require("../../../utilities/AssignmentManager");

async function handler(
  interaction,
  { t, interacting, logger, assistantStore, assignmentManager, user, EmbedFormManager },
) {
  const group = assignmentManager.resolveGroup(assistantStore.getUserById(user.id)?.group);
  if (!group) return interacting.replyToInteraction(interaction, t("done.noGroup"));

  const assignments = assignmentManager.loadAssignments(group);
  const upcoming = assignments.filter((assignment) => AssignmentManager.dueOf(assignment) > Date.now());
  if (upcoming.length === 0) return interacting.replyToInteraction(interaction, t("done.none", { group }));

  const done = new Set(assistantStore.getUserById(user.id)?.done || []);
  const form = new EmbedFormManager(interaction, interacting);
  const selectId = `done_${interaction.id}`;
  await form
    .createEmbed(t("done.title", { group }), t("done.prompt"), "info")
    .addDropdown(
      selectId,
      t("done.placeholder"),
      upcoming.map((assignment, index) => ({
        label: `${done.has(AssignmentManager.keyOf(assignment)) ? "✅ " : ""}${assignment.title}`,
        description: `${assignment.subject} · ${assignment.date}`,
        value: String(index),
      })),
    )
    .send();

  const selection = await form.awaitComponent(selectId);
  if (!selection) return form.showTimeout();

  const assignment = upcoming[Number(selection.values[0])];
  const key = AssignmentManager.keyOf(assignment);
  const nowDone = !done.has(key);
  if (nowDone) done.add(key);
  else done.delete(key);
  const existing = new Set(assignments.map(AssignmentManager.keyOf));
  assistantStore.setUserField(
    user.id,
    "done",
    [...done].filter((k) => existing.has(k)),
  );
  logger.logMessage(`[ NOTICE ] ${user.username} marked "${assignment.title}" as ${nowDone ? "done" : "not done"}`);

  await form
    .createEmbed(
      t("done.title", { group }),
      t(nowDone ? "done.marked" : "done.unmarked", { title: assignment.title }),
      nowDone ? "success" : "info",
    )
    .clearComponents()
    .update(selection);
}

module.exports = handler;
