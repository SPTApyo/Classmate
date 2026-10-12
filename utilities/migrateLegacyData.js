const fs = require("fs");
const path = require("path");
const { fromRoot } = require("./paths");
const { readJson, writeJsonAtomic } = require("./jsonFile");

const OLD_DIR = fromRoot("data", "devoirs");
const NEW_DIR = fromRoot("data", "assignments");
const OLD_PREFIX = "devoirs_";
const NEW_PREFIX = "assignments_";
const LEGACY_DATE = /^(\d{2})-(\d{2})-(\d{4})$/;

// Writes back only when something changed.
function rewrite(filePath, change) {
  if (!fs.existsSync(filePath)) return false;
  const data = readJson(filePath);
  if (!change(data)) return false;
  writeJsonAtomic(filePath, data);
  return true;
}

function renameKey(object, from, to) {
  if (!object || !(from in object)) return false;
  if (!(to in object)) object[to] = object[from];
  delete object[from];
  return true;
}

function migrateAssignmentFiles() {
  if (fs.existsSync(OLD_DIR) && !fs.existsSync(NEW_DIR)) fs.renameSync(OLD_DIR, NEW_DIR);
  if (!fs.existsSync(NEW_DIR)) return 0;
  let count = 0;
  for (const file of fs.readdirSync(NEW_DIR)) {
    if (!file.startsWith(OLD_PREFIX) || !file.endsWith(".json")) continue;
    const oldPath = path.join(NEW_DIR, file);
    const records = readJson(oldPath);
    const converted = (Array.isArray(records) ? records : []).map(({ devoir, matiere, ...rest }) => ({
      title: devoir,
      subject: matiere,
      ...rest,
    }));
    writeJsonAtomic(path.join(NEW_DIR, NEW_PREFIX + file.slice(OLD_PREFIX.length)), converted);
    fs.unlinkSync(oldPath);
    count++;
  }
  return count;
}

// Applies every pair; true when any key moved.
function renameKeys(object, pairs) {
  return pairs.reduce((changed, [from, to]) => renameKey(object, from, to) || changed, false);
}

const RENAMED_FILES = [
  [
    ["config", "llmData.json"],
    ["config", "persona.json"],
  ],
  [
    ["user_data", "llmUsers.json"],
    ["user_data", "users.json"],
  ],
  [
    ["user_data", "llmDirectives.json"],
    ["user_data", "directives.json"],
  ],
];
const SETTINGS_KEYS = [["saeNames", "projectSubjects"]];
const APPEARANCE_KEYS = [
  ["embedDevoirsColor", "embedAssignmentsColor"],
  ["embedQCMColor", "embedQuizzesColor"],
  ["embedSAEColor", "embedProjectsColor"],
];
const DIGEST_KEYS = [
  ["devoirs", "assignments"],
  ["qcm", "quizzes"],
  ["sae", "projects"],
];
const USER_KEYS = [
  ["pseudo", "username"],
  ["train_prog", "level"],
];

// Also used on imported or hand-edited settings.
function migrateSettings(s) {
  const tasksChanged = (s.tasks || []).reduce(
    (changed, task) => renameKey(task, "trainProg", "level") || changed,
    false,
  );
  return [renameKeys(s, SETTINGS_KEYS), renameKeys(s.appearance, APPEARANCE_KEYS), tasksChanged].some(Boolean);
}

// Renames 1.7 data; runs before settings load.
function migrateLegacyData() {
  const changes = [];
  const files = migrateAssignmentFiles();
  if (files > 0) changes.push(`${files} assignment file(s)`);

  for (const [from, to] of RENAMED_FILES) {
    const oldPath = fromRoot("data", ...from);
    const newPath = fromRoot("data", ...to);
    if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) continue;
    fs.renameSync(oldPath, newPath);
    changes.push(`${from[1]} to ${to[1]}`);
  }

  let datedFiles = 0;
  for (const file of fs.existsSync(NEW_DIR) ? fs.readdirSync(NEW_DIR) : []) {
    if (!file.startsWith(NEW_PREFIX) || !file.endsWith(".json")) continue;
    const changed = rewrite(path.join(NEW_DIR, file), (records) =>
      [records].flat().reduce((any, record) => {
        const match = LEGACY_DATE.exec(record.date || "");
        if (match) record.date = `${match[3]}-${match[2]}-${match[1]}`;
        return Boolean(match) || any;
      }, false),
    );
    if (changed) datedFiles++;
  }
  if (datedFiles > 0) changes.push(`dates to YYYY-MM-DD in ${datedFiles} file(s)`);

  const statePath = path.join(NEW_DIR, "notifier-state.json");
  const stateChanged = rewrite(statePath, (state) =>
    Object.values(state.digest || {}).reduce((changed, digest) => renameKeys(digest, DIGEST_KEYS) || changed, false),
  );
  if (stateChanged) changes.push("notifier state");

  const settingsChanged = rewrite(fromRoot("data", "config", "settings.json"), migrateSettings);
  if (settingsChanged) changes.push("settings.json");

  const usersChanged = rewrite(fromRoot("data", "user_data", "users.json"), (data) =>
    (data.users || []).reduce((changed, user) => renameKeys(user, USER_KEYS) || changed, false),
  );
  if (usersChanged) changes.push("users.json");

  const personaChanged = rewrite(fromRoot("data", "config", "persona.json"), (data) => {
    if (typeof data.systemInstruction !== "string") return false;
    const next = data.systemInstruction
      .replaceAll("[designerPseudo]", "[designerUsername]")
      .replace(/,? first name \[designer(Prenom|FirstName)\]/g, "")
      .replace(/\[designer(Prenom|FirstName)\]/g, "");
    if (next === data.systemInstruction) return false;
    data.systemInstruction = next;
    return true;
  });
  if (personaChanged) changes.push("persona.json");

  return changes;
}

module.exports = { migrateLegacyData, migrateSettings };
