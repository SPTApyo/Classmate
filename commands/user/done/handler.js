const DevoirManager = require("../../../utilities/DevoirManager");

async function handler(interaction, { t, interacting, logger, llmDataManager, devoirManager, user, EmbedFormManager }) {
  const group = devoirManager.resolveGroup(llmDataManager.getUserById(user.id)?.group);
  if (!group) return interacting.replyToInteraction(interaction, t("done.noGroup"));

  const devoirs = devoirManager.loadDevoirs(group);
  const upcoming = devoirs.filter((devoir) => DevoirManager.dueOf(devoir) > Date.now());
  if (upcoming.length === 0) return interacting.replyToInteraction(interaction, t("done.none", { group }));

  const done = new Set(llmDataManager.getUserById(user.id)?.done || []);
  const form = new EmbedFormManager(interaction, interacting);
  const selectId = `done_${interaction.id}`;
  await form
    .createEmbed(t("done.title", { group }), t("done.prompt"), "info")
    .addDropdown(
      selectId,
      t("done.placeholder"),
      upcoming.map((devoir, index) => ({
        label: `${done.has(DevoirManager.keyOf(devoir)) ? "✅ " : ""}${devoir.devoir}`,
        description: `${devoir.matiere} · ${devoir.date}`,
        value: String(index),
      })),
    )
    .send();

  const selection = await form.awaitComponent(selectId);
  if (!selection) return form.showTimeout();

  const devoir = upcoming[Number(selection.values[0])];
  const key = DevoirManager.keyOf(devoir);
  const nowDone = !done.has(key);
  if (nowDone) done.add(key);
  else done.delete(key);
  const existing = new Set(devoirs.map(DevoirManager.keyOf));
  llmDataManager.setUserField(
    user.id,
    "done",
    [...done].filter((k) => existing.has(k)),
  );
  logger.logMessage(`[ NOTICE ] ${user.username} marked "${devoir.devoir}" as ${nowDone ? "done" : "not done"}`);

  await form
    .createEmbed(
      t("done.title", { group }),
      t(nowDone ? "done.marked" : "done.unmarked", { title: devoir.devoir }),
      nowDone ? "success" : "info",
    )
    .clearComponents()
    .update(selection);
}

module.exports = handler;
