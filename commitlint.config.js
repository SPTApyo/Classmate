module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "bot",
        "assistant",
        "commands",
        "actions",
        "assignments",
        "i18n",
        "converter",
        "docker",
        "ci",
        "docs",
        "deps",
        "config",
        "tooling",
      ],
    ],
    "header-max-length": [2, "always", 72],
  },
};
