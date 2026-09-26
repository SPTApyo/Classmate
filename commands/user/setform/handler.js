const { createProfileFieldHandler } = require("../../../utilities/ProfileFieldCommand");

module.exports = createProfileFieldHandler({
  field: "train_prog",
  getChoices: () => ["BUT1", "BUT2", "BUT3", "Autre"],
});
