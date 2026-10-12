import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCALES = ["en", "fr"];
const SOURCE_DIRS = ["index.js", "commands", "assistant", "utilities"];
// Matches t("key"), translate("key") and userError("key").
const KEY_CALL = /\b(?:t|translate|userError)\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
const PROFILE_FIELDS = ["dept", "level", "group"];
const PROFILE_KEYS = [
  "selectTitle",
  "selectPrompt",
  "placeholder",
  "successTitle",
  "successText",
  "timeoutText",
  "errorText",
];

function flatten(node, prefix = "") {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === "object" ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

async function listSources(entry) {
  const full = path.join(ROOT, entry);
  if (entry.endsWith(".js")) return [full];
  const items = await readdir(full, { withFileTypes: true, recursive: true });
  return items
    .filter((item) => item.isFile() && item.name.endsWith(".js"))
    .map((item) => path.join(item.parentPath, item.name));
}

async function loadKeys(locale) {
  const json = JSON.parse(await readFile(path.join(ROOT, "locales", `${locale}.json`), "utf8"));
  return new Set(flatten(json));
}

const keysByLocale = Object.fromEntries(await Promise.all(LOCALES.map(async (l) => [l, await loadKeys(l)])));
const [reference, ...others] = LOCALES;
const errors = [];

for (const locale of others) {
  for (const key of keysByLocale[reference]) {
    if (!keysByLocale[locale].has(key)) errors.push(`${locale}: missing ${key}`);
  }
  for (const key of keysByLocale[locale]) {
    if (!keysByLocale[reference].has(key)) errors.push(`${reference}: missing ${key}`);
  }
}

// Dynamic keys built from profile field names.
const usedKeys = new Set([...PROFILE_FIELDS.flatMap((field) => PROFILE_KEYS.map((key) => `profile.${field}.${key}`))]);
for (const file of (await Promise.all(SOURCE_DIRS.map(listSources))).flat()) {
  for (const [, key] of (await readFile(file, "utf8")).matchAll(KEY_CALL)) usedKeys.add(key);
}
for (const key of usedKeys) {
  if (!keysByLocale[reference].has(key)) errors.push(`missing key used in code: ${key}`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`i18n OK: ${keysByLocale[reference].size} keys, ${usedKeys.size} used in code.`);
