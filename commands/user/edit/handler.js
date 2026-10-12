const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const moment = require("moment");
const AssignmentManager = require("../../../utilities/AssignmentManager");
const { promptGroup, promptAssignment } = require("../../../utilities/AssignmentPrompts");

const MODAL_TIMEOUT_MS = 5 * 60 * 1000;
const MODAL_TITLE_LIMIT = 45;

function textInput(customId, label, value, style = TextInputStyle.Short, maxLength = 200) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(style)
      .setRequired(true)
      .setMaxLength(maxLength)
      .setValue(String(value ?? "").slice(0, maxLength)),
  );
}

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
    t("edit.selectTitle"),
    groupChoice.interaction,
  );
  if (!assignmentChoice) return;
  const { assignment, interaction: selection } = assignmentChoice;

  const modalId = `edit_assignment_${interaction.id}`;
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(t("edit.modal.title", { group }).slice(0, MODAL_TITLE_LIMIT))
    .addComponents(
      textInput("title", t("edit.modal.assignment"), assignment.title, TextInputStyle.Paragraph, 400),
      textInput("subject", t("edit.modal.subject"), assignment.subject),
      textInput("date", t("edit.modal.dueDate"), assignment.date, TextInputStyle.Short, 10),
    );
  await selection.showModal(modal);

  const submit = await selection
    .awaitModalSubmit({
      filter: (s) => s.customId === modalId && s.user.id === interaction.user.id,
      time: MODAL_TIMEOUT_MS,
    })
    .catch(() => null);
  if (!submit) return form.showTimeout();

  const values = {
    title: submit.fields.getTextInputValue("title").trim(),
    subject: submit.fields.getTextInputValue("subject").trim(),
    date: submit.fields.getTextInputValue("date").trim(),
  };
  if (!moment(values.date, AssignmentManager.DATE_FORMAT, true).isValid()) {
    return form
      .createEmbed(t("edit.invalidDate.title"), t("edit.invalidDate.description", { date: values.date }), "danger")
      .clearComponents()
      .update(submit);
  }

  // Reload: the file may have changed meanwhile.
  const assignments = assignmentManager.loadAssignments(group);
  const target = assignments.find((d) => d.id === assignment.id);
  if (!target) {
    return form.createEmbed(t("common.error.title"), t("edit.gone"), "danger").clearComponents().update(submit);
  }
  Object.assign(target, values);
  assignmentManager.saveAssignments(group, assignments);
  assignmentManager.sortAssignments();

  logger.logMessage(`[ SUCCESS ] Assignment ${target.id} updated in ${group} by ${user.username}`);
  const details = t("assignment.details", {
    id: target.id,
    title: target.title,
    subject: target.subject,
    date: target.date,
  });
  await form.createEmbed(t("edit.success", { group }), details, "success").clearComponents().update(submit);
}

module.exports = handler;
