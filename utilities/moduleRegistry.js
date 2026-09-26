const fs = require("fs");
const { fromRoot } = require("./paths");

// Build replaces this module with a static registry.
module.exports = {
  has: (relPath) => fs.existsSync(fromRoot(relPath)),
  load: (relPath) => require(fromRoot(relPath)),
};
