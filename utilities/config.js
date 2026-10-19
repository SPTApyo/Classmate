const fs = require("fs");
const { fromRoot } = require("./paths");
const { readJson, writeJsonAtomic } = require("./jsonFile");
const { migrateSettings } = require("./migrateLegacyData");

const CONFIG_PATH = fromRoot("data", "config", "config.json");
const SETTINGS_PATH = fromRoot("data", "config", "settings.json");
const POLL_INTERVAL_MS = 5000;
const GROUP_NAME_REGEX = /^[A-Za-z0-9_-]{1,32}$/;

function readConfigFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const example = filePath.replace(/\.json$/, ".example.json");
    throw new Error(
      `No configuration: ${filePath} is missing. Set the container environment (DISCORD_TOKEN, GEMINI_API_KEY, ` +
        `CONFIG__guildId, SETTINGS__tasks__0__icsUrl, SETTINGS__tasks__0__reminderChannelId), or copy ${example} ` +
        "(defaults/ in the image) and fill it in. See docs/configuration.md.",
    );
  }
  return readJson(filePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid settings.json: ${message}`);
}

const isString = (value) => typeof value === "string" && value.length > 0;
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");

const AMBIENT_NUMBERS = [
  "minScore",
  "confidence",
  "debounceSeconds",
  "cooldownMinutes",
  "maxChecksPerHour",
  "maxInterventionsPerHour",
  "dailyTokenBudget",
  "contextMessages",
];

function validateAmbient(ambient) {
  assert(ambient && typeof ambient === "object", "ambient must be an object");
  assert(isStringArray(ambient.channels ?? []), "ambient.channels must be an array of channel IDs");
  for (const key of AMBIENT_NUMBERS) {
    const value = ambient[key];
    assert(
      value === undefined || (typeof value === "number" && value >= 0),
      `ambient.${key} must be a positive number`,
    );
  }
}

const isOptionalString = (value) => value === undefined || value === null || typeof value === "string";
const isHour = (value) => Number.isInteger(value) && value >= 0 && value <= 23;
const MAX_DEADLINE_HOURS = 24 * 14;

function validateNotifications(notifications) {
  assert(notifications && typeof notifications === "object", "notifications must be an object");
  for (const key of ["ownerAlerts", "timetableChanges"]) {
    const value = notifications[key];
    assert(value === undefined || typeof value === "boolean", `notifications.${key} must be true or false`);
  }
  const hours = notifications.deadlineHours ?? [];
  assert(
    Array.isArray(hours) && hours.every((h) => typeof h === "number" && h > 0 && h <= MAX_DEADLINE_HOURS),
    `notifications.deadlineHours must list hours between 1 and ${MAX_DEADLINE_HOURS}`,
  );
  const brief = notifications.eveningBriefHour;
  assert(brief === undefined || brief === null || isHour(brief), "notifications.eveningBriefHour must be 0-23 or null");
}

function validateSettings(settings) {
  assert(settings && typeof settings === "object", "root must be an object");
  assert(isOptionalString(settings.assistantName), "assistantName must be a string");
  assert(Array.isArray(settings.tasks), "tasks must be an array");
  settings.tasks.forEach((task, i) => {
    assert(GROUP_NAME_REGEX.test(task?.group || ""), `tasks[${i}].group must match ${GROUP_NAME_REGEX}`);
    assert(isString(task.icsUrl), `tasks[${i}].icsUrl is required`);
    assert(isString(task.reminderChannelId), `tasks[${i}].reminderChannelId is required`);
    assert(isOptionalString(task.roleId), `tasks[${i}].roleId must be a role ID`);
    assert(isOptionalString(task.level), `tasks[${i}].level must be a string`);
  });
  if (settings.notifications !== undefined) validateNotifications(settings.notifications);
  assert(isStringArray(settings.projectSubjects ?? []), "projectSubjects must be an array of strings");
  assert(isStringArray(settings.planning?.departments ?? []), "planning.departments must be an array of strings");
  assert(isStringArray(settings.adminRoles ?? []), "adminRoles must be an array of role IDs");
  assert(settings.channels && typeof settings.channels === "object", "channels is required");
  assert(settings.appearance && typeof settings.appearance === "object", "appearance is required");
  assert(isStringArray(settings.llm?.models) && settings.llm.models.length > 0, "llm.models needs at least one model");
  if (settings.ambient !== undefined) validateAmbient(settings.ambient);
  const groups = settings.tasks.map((task) => task.group.toUpperCase());
  assert(new Set(groups).size === groups.length, "tasks contain duplicate groups");
  return settings;
}

function notify() {
  for (const listener of listeners) listener(current);
}

function writeSettings(next) {
  migrateSettings(next);
  validateSettings(next);
  writeJsonAtomic(SETTINGS_PATH, next);
  current = next;
  notify();
  return current;
}

// Restart required: read once at startup.
const config = readConfigFile(CONFIG_PATH);

let current = validateSettings(readConfigFile(SETTINGS_PATH));
const listeners = new Set();

const settings = {
  get: () => current,

  // Invalid files throw and keep previous settings.
  reload() {
    const next = readConfigFile(SETTINGS_PATH);
    migrateSettings(next);
    current = validateSettings(next);
    notify();
    return current;
  },

  // Mutates a copy; invalid results throw, nothing saved.
  update(mutator) {
    const next = structuredClone(current);
    mutator(next);
    return writeSettings(next);
  },

  replace(next) {
    return writeSettings(structuredClone(next));
  },

  onChange(listener) {
    listeners.add(listener);
  },

  // Polling also works on Docker bind mounts.
  watch(logger) {
    fs.watchFile(SETTINGS_PATH, { interval: POLL_INTERVAL_MS }, (curr, prev) => {
      if (curr.mtimeMs === prev.mtimeMs) return;
      try {
        settings.reload();
        logger.logMessage("[ SUCCESS ] settings.json reloaded");
      } catch (error) {
        logger.logMessage("[ ERROR ] settings.json rejected, keeping previous settings", error);
      }
    });
  },
};

module.exports = { config, settings, validateSettings };
