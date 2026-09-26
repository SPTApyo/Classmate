const { createProfileFieldHandler } = require("../../../utilities/ProfileFieldCommand");

module.exports = createProfileFieldHandler({
  field: "group",
  getChoices: ({ devoirManager }) => devoirManager.getAllGroups(),
});
