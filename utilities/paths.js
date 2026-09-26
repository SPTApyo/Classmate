const path = require("path");

// Entry point folder; valid in sources and bundle.
const ROOT = require.main ? path.dirname(require.main.filename) : process.cwd();

module.exports = {
  ROOT,
  fromRoot: (...segments) => path.join(ROOT, ...segments),
};
