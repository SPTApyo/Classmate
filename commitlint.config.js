module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      ["bot", "llm", "commands", "actions", "devoirs", "i18n", "docker", "deps", "config", "tooling"],
    ],
    "header-max-length": [2, "always", 100],
  },
};
