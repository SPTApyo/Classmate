const { settings } = require("./config");
const en = require("../locales/en.json");
const fr = require("../locales/fr.json");

const LOCALES = { en, fr };
const FALLBACK_LOCALE = "en";

// Read on each call: settings are hot-swappable.
function defaultLocale() {
  const locale = settings.get().defaultLocale;
  return LOCALES[locale] ? locale : FALLBACK_LOCALE;
}

// Interactions carry the user's locale; messages do not.
function resolveLocale(source) {
  const base = String(source?.locale || "")
    .slice(0, 2)
    .toLowerCase();
  return LOCALES[base] ? base : defaultLocale();
}

function lookup(locale, key) {
  return key.split(".").reduce((node, part) => node?.[part], LOCALES[locale]);
}

function t(locale, key, params = {}) {
  const template = lookup(locale, key) ?? lookup(FALLBACK_LOCALE, key) ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// Source: interaction, message, locale code or nothing.
function translator(source) {
  const locale = typeof source === "string" ? source : resolveLocale(source);
  const translate = (key, params) => t(locale, key, params);
  translate.locale = locale;
  return translate;
}

function userError(key, params = {}) {
  const error = new Error(t(FALLBACK_LOCALE, key, params));
  error.i18nKey = key;
  error.i18nParams = params;
  return error;
}

function describeUserError(translate, error) {
  return error?.i18nKey ? translate(error.i18nKey, error.i18nParams) : null;
}

module.exports = { t, translator, resolveLocale, defaultLocale, userError, describeUserError, LOCALES };
