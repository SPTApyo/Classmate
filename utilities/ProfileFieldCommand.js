const EmbedFormManager = require("./EmbedFormManager");

// Builds a /setX handler; texts live under profile.<field>.
function createProfileFieldHandler({ field, getChoices }) {
  return async function handler(interaction, deps) {
    const { user, logger, interacting, saveUserProfile } = deps;
    const form = new EmbedFormManager(interaction, interacting);
    const text = (key, params) => form.t(`profile.${field}.${key}`, params);
    const choices = getChoices(deps);

    if (choices.length === 0) {
      return form.createEmbed(text("selectTitle"), form.t("profile.noChoice"), "danger").send();
    }

    const dropdownId = `select_${field}_${interaction.id}`;
    await form
      .createEmbed(text("selectTitle"), text("selectPrompt"), "info")
      .addDropdown(
        dropdownId,
        text("placeholder"),
        choices.map((c) => ({ label: c, value: c })),
      )
      .send();

    const selection = await form.awaitComponent(dropdownId);
    if (!selection) return form.showTimeout(text("timeoutText"));

    const value = selection.values[0];
    const updated = await saveUserProfile(user.id, { username: user.username, [field]: value });
    if (!updated) {
      logger.logMessage(`[ ERROR ] Failed to update ${field} for ${user.username} (${user.id})`);
      return form
        .createEmbed(form.t("common.error.title"), text("errorText"), "danger")
        .clearComponents()
        .update(selection);
    }

    await form
      .createEmbed(text("successTitle"), text("successText", { value }), "success")
      .clearComponents()
      .update(selection);
    logger.logMessage(`[ SUCCESS ] Updated ${field} for ${user.username} (${user.id}): ${value}`);
  };
}

module.exports = { createProfileFieldHandler };
