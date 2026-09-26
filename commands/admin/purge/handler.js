const { ButtonStyle } = require("discord.js");

const CONFIRM_TIMEOUT_MS = 15000;
const ALL_GROUPS = "ALL";

async function handler(interaction, { t, interacting, logger, devoirManager, user, EmbedFormManager }) {
  const groups = devoirManager.getAllGroups();
  if (groups.length === 0) return interacting.replyToInteraction(interaction, t("purge.noGroups"));

  const form = new EmbedFormManager(interaction, interacting);
  const selectId = `select_purge_group_${interaction.id}`;
  const confirmId = `confirm_purge_${interaction.id}`;
  const cancelId = `cancel_purge_${interaction.id}`;

  await form
    .createEmbed(t("purge.title"), t("purge.description"), "danger")
    .addDropdown(selectId, t("purge.placeholder"), [
      { label: t("purge.all"), value: ALL_GROUPS },
      ...groups.map((g) => ({ label: g, value: g })),
    ])
    .send();

  const selection = await form.awaitComponent(selectId);
  if (!selection) return form.showTimeout();

  const selected = selection.values[0];
  const targets = selected === ALL_GROUPS ? groups : [selected];
  const scope = selected === ALL_GROUPS ? t("purge.scopeAll") : t("purge.scopeGroup", { group: selected });

  await form
    .createEmbed(t("purge.confirm.title"), t("purge.confirm.description", { scope }), "danger")
    .clearComponents()
    .addButtons([
      { customId: confirmId, label: t("common.confirm"), style: ButtonStyle.Danger },
      { customId: cancelId, label: t("common.cancel"), style: ButtonStyle.Secondary },
    ])
    .update(selection);

  const choice = await form.awaitComponent([confirmId, cancelId], CONFIRM_TIMEOUT_MS);
  if (!choice) return form.showTimeout();
  if (choice.customId === cancelId) {
    return form
      .createEmbed(t("purge.cancelled.title"), t("purge.cancelled.description"), "info")
      .clearComponents()
      .update(choice);
  }

  devoirManager.purgeGroups(targets);
  logger.logMessage(`[ SUCCESS ] Assignments purged (${targets.join(", ")}) by ${user.username}`);
  await form
    .createEmbed(t("purge.done.title"), t("purge.done.description", { scope }), "success")
    .clearComponents()
    .update(choice);
}

module.exports = handler;
