const moment = require("moment");
const DevoirManager = require("../../../utilities/DevoirManager");

async function handler(interaction, { t, interacting, logger, devoirManager, user, settings }) {
  const rawGroup = interaction.options.getString("group");
  const group = devoirManager.resolveGroup(rawGroup);
  if (!group) {
    const groups = devoirManager.getAllGroups().join(", ");
    return interacting.replyToInteraction(interaction, t("common.unknownGroup", { group: rawGroup, groups }));
  }

  const title = interaction.options.getString("title").trim().toUpperCase();
  const subject = interaction.options.getString("subject").trim().toUpperCase();
  const date = interaction.options.getString("due_date").trim();
  if (!moment(date, DevoirManager.DATE_FORMAT, true).isValid()) {
    return interacting.replyToInteraction(interaction, t("common.invalidDate"));
  }

  const { created } = devoirManager.addDevoir({ group, devoir: title, matiere: subject, date, addedBy: user.username });
  devoirManager.removeExpiredDevoirs();
  devoirManager.sortDevoirs();

  const embed = interacting.createEmbed(
    t(created ? "add.created" : "add.updated", { group }),
    t("add.details", { title, subject, date, user: user.username }),
    settings.get().appearance.embedGlobalColor,
  );
  logger.logMessage(`[ SUCCESS ] Assignment ${created ? "added to" : "updated in"} ${group} by ${user.username}`);
  await interacting.replyToInteraction(interaction, null, embed);
}

module.exports = handler;
