const fs = require("fs");
const { fromRoot } = require("./paths");
const { readJson, writeJsonAtomic } = require("./jsonFile");

const SEPARATOR = "__";
const FILES = [
  { prefix: "CONFIG", name: "config.json", template: "config.example.json" },
  { prefix: "SETTINGS", name: "settings.json", template: "settings.example.json" },
  { prefix: "PERSONA", name: "persona.json", template: "persona.json" },
];

// JSON when valid; Discord IDs stay strings.
function parseValue(raw) {
  try {
    const value = JSON.parse(raw);
    return typeof value === "number" && !Number.isSafeInteger(value) && /^\d+$/.test(raw) ? raw : value;
  } catch {
    return raw;
  }
}

// Numeric segments index arrays: tasks__0__group.
function setPath(target, segments, raw) {
  let node = target;
  segments.forEach((segment, i) => {
    const key = /^\d+$/.test(segment) ? Number(segment) : segment;
    if (i === segments.length - 1) {
      // Existing text keys stay text: "1A".
      node[key] = typeof node[key] === "string" ? raw : parseValue(raw);
      return;
    }
    if (node[key] === null || typeof node[key] !== "object") node[key] = /^\d+$/.test(segments[i + 1]) ? [] : {};
    node = node[key];
  });
}

function templateFor({ template }) {
  return [fromRoot("data", "config", template), fromRoot("defaults", template)].find((p) => fs.existsSync(p));
}

// Compose wins at each start; returns applied keys.
function applyEnvOverrides(env = process.env) {
  const applied = [];
  for (const file of FILES) {
    const entries = Object.entries(env).filter(([key]) => key.startsWith(file.prefix + SEPARATOR));
    if (entries.length === 0) continue;
    const filePath = fromRoot("data", "config", file.name);
    const base = fs.existsSync(filePath) ? filePath : templateFor(file);
    const data = base ? readJson(base) : {};
    for (const [key, raw] of entries) {
      setPath(data, key.slice(file.prefix.length + SEPARATOR.length).split(SEPARATOR), raw);
      applied.push(key);
    }
    writeJsonAtomic(filePath, data);
  }
  return applied;
}

module.exports = { applyEnvOverrides, parseValue, setPath };
