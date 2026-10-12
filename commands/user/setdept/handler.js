const { createProfileFieldHandler } = require("../../../utilities/ProfileFieldCommand");

module.exports = createProfileFieldHandler({
  field: "dept",
  getChoices: ({ settings }) => {
    const { departments, defaultDept } = settings.get().planning || {};
    return departments || [defaultDept].filter(Boolean);
  },
});
