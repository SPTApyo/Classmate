const { createProfileFieldHandler } = require("../../../utilities/ProfileFieldCommand");

module.exports = createProfileFieldHandler({
  field: "dept",
  getChoices: () => ["INFO", "CS", "GIM", "RT", "LPMA", "Autre"],
});
