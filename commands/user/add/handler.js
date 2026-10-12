const moment = require("moment");
const AssignmentManager = require("../../../utilities/AssignmentManager");

async function handler(interaction, { t, interacting, logger, assignmentManager, user, settings }) {
  const rawGroup = interaction.options.getString("group");
  const group = assignmentManager.resolveGroup(rawGroup);
  if (!group) {
    const groups = assignmentManager.getAllGroups().join(", ");
    return interacting.replyToInteraction(interaction, t("common.unknownGroup", { group: rawGroup, groups }));
  }

  const title = interaction.options.getString("title").trim().toUpperCase();
  const subject = interaction.options.getString("subject").trim().toUpperCase();
  const date = interaction.options.getString("due_date").trim();
  if (!moment(date, AssignmentManager.DATE_FORMAT, true).isValid()) {
    return interacting.replyToInteraction(interaction, t("common.invalidDate"));
  }

  const { created } = assignmentManager.addAssignment({ group, title, subject, date, addedBy: user.username });
  assignmentManager.removeExpired();
  assignmentManager.sortAssignments();

  const embed = interacting.createEmbed(
    t(created ? "add.created" : "add.updated", { group }),
    t("add.details", { title, subject, date, user: user.username }),
    settings.get().appearance.embedGlobalColor,
  );
  logger.logMessage(`[ SUCCESS ] Assignment ${created ? "added to" : "updated in"} ${group} by ${user.username}`);
  await interacting.replyToInteraction(interaction, null, embed);
}

module.exports = handler;
