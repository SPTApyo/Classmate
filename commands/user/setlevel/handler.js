const { createProfileFieldHandler } = require("../../../utilities/ProfileFieldCommand");

module.exports = createProfileFieldHandler({
  field: "level",
  getChoices: ({ settings }) => [
    ...new Set(
      settings
        .get()
        .tasks.map((task) => task.level)
        .filter(Boolean),
    ),
  ],
});
