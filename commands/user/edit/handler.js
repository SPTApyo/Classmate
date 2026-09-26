const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const moment = require("moment");
const DevoirManager = require("../../../utilities/DevoirManager");
const { promptGroup, promptDevoir } = require("../../../utilities/DevoirPrompts");

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
    t("edit.selectTitle"),
    groupChoice.interaction,
  );
  if (!devoirChoice) return;
  const { devoir, interaction: selection } = devoirChoice;

  const modalId = `edit_devoir_${interaction.id}`;
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(t("edit.modal.title", { group }).slice(0, MODAL_TITLE_LIMIT))
    .addComponents(
      textInput("devoir", t("edit.modal.assignment"), devoir.devoir, TextInputStyle.Paragraph, 400),
      textInput("matiere", t("edit.modal.subject"), devoir.matiere),
      textInput("date", t("edit.modal.dueDate"), devoir.date, TextInputStyle.Short, 10),
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
    devoir: submit.fields.getTextInputValue("devoir").trim(),
    matiere: submit.fields.getTextInputValue("matiere").trim(),
    date: submit.fields.getTextInputValue("date").trim(),
  };
  if (!moment(values.date, DevoirManager.DATE_FORMAT, true).isValid()) {
    return form
      .createEmbed(t("edit.invalidDate.title"), t("edit.invalidDate.description", { date: values.date }), "danger")
      .clearComponents()
      .update(submit);
  }

  // Reload: the file may have changed meanwhile.
  const devoirs = devoirManager.loadDevoirs(group);
  const target = devoirs.find((d) => d.id === devoir.id);
  if (!target) {
    return form.createEmbed(t("common.error.title"), t("edit.gone"), "danger").clearComponents().update(submit);
  }
  Object.assign(target, values);
  devoirManager.saveDevoirsForGroup(group, devoirs);
  devoirManager.sortDevoirs();

  logger.logMessage(`[ SUCCESS ] Assignment ${target.id} updated in ${group} by ${user.username}`);
  const details = t("devoir.details", {
    id: target.id,
    title: target.devoir,
    subject: target.matiere,
    date: target.date,
  });
  await form.createEmbed(t("edit.success", { group }), details, "success").clearComponents().update(submit);
}

module.exports = handler;
