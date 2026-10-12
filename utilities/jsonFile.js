const fs = require("fs");

// Temp file then rename: never a half-written file.
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmpPath, filePath);
}

// Parse errors name the file.
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${filePath}: ${error.message}`, { cause: error });
  }
}

// Unreadable files are set aside, never overwritten.
function readJsonOrSetAside(filePath, fallback, log) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return readJson(filePath);
  } catch (error) {
    const backup = `${filePath}.corrupt-${Date.now()}`;
    fs.renameSync(filePath, backup);
    log(`[ ERROR ] ${error.message}; moved to ${backup}`);
    return fallback;
  }
}

module.exports = { readJson, writeJsonAtomic, readJsonOrSetAside };
