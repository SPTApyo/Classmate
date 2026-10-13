# Contributing

Issues and pull requests are welcome. For anything bigger than a small fix, open an issue first so we agree on the
approach.

## Setup

You need Node.js 22 or later, and a Discord server of your own to try changes on.

```bash
git clone https://github.com/SPTApyo/classmate.git
cd classmate
npm install   # also installs the git hooks
```

Then follow [docs/configuration.md](docs/configuration.md) to create data/keys/.env and the two JSON files. Run with
PROCESS_TEST_MODE=1: every reminder and alert goes to the test channel and nobody gets pinged.

| Command                      | What it does                                                        |
| ---------------------------- | ------------------------------------------------------------------- |
| npm start                    | run the bot from sources                                            |
| npm run check                | everything CI checks: ESLint, comment rules, Prettier, translations |
| npm run lint:fix             | fix what ESLint can fix                                             |
| npm run format               | format the code                                                     |
| npm run i18n:check           | locales match and every key used in code exists                     |
| npm run build                | bundle into dist/, as the Docker image does                         |
| npm run start:dist           | run the bundle                                                      |
| docker compose up -d --build | run both images built from your checkout                            |

## Workflow

1. main is protected: every change goes through a pull request, and CI must pass. Direct pushes and force-pushes
   are refused.
2. Branch from main and name the branch after its intent: feat/..., fix/..., refactor/..., docs/..., ci/...,
   chore/...
3. One pull request, one topic. If its description needs the word "and", it is probably two pull requests. As a
   guide, stay under 400 changed lines and 10 files, lockfiles aside.
4. CI must be green before merging.
5. Pull requests are squash merged: the pull request title becomes the commit on main, so it follows the commit rules
   below.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org):

```text
type(scope): summary
```

- type: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- scope is optional: bot, assistant, commands, actions, assignments, i18n, converter, docker, ci, docs, deps, deps-dev, config, tooling.
- summary: imperative, lower case, no final period, 72 characters max for the whole line.
- A breaking change adds ! after the type (feat!: ...) and explains the break in the body.
- One commit, one intent.

The commit-msg hook checks this locally with commitlint. CI checks every commit of a pull request.

## Code

- Keep it simple. No new dependency for what a few lines can do.
- Logs are in English, prefixed with a tag: [ SUCCESS ], [ ERROR ], [ NOTICE ], optionally [ AI ], [ STORE ]
  or [ AMBIENT ].
- Never commit secrets, tokens, calendar URLs or anything under data/ besides the templates.
- No lint suppressions: fix what ESLint reports.

## Comments

Enforced by eslint-rules/max-comment-words.js:

- Eight words at most, in English.
- Explain why, never what changed. History belongs in commit messages.
  - Good: // Bulk delete skips messages older than 14 days.
  - Bad: // Removed the old log because it crashed the bot
- No comment when the code says it already. Prefer a clear name.

## Discord text

Discord messages are never hard-coded. Add the key to both locales/en.json and locales/fr.json, then:

- slash commands: deps.t("key", { param }), in the user's Discord locale;
- channel messages: translator() from utilities/i18n.js, in defaultLocale;
- errors shown to users: throw userError("key", params).

Slash command descriptions go in command.json, with description_localizations.fr. Results of assistant tools are read
by the model only: keep them in English, without i18n.

## Adding a slash command

1. Create commands/LEVEL/NAME/command.json, where LEVEL is owner, admin or user and the folder name is the
   command name.
2. Create handler.js exporting async (interaction, deps) => {}.
3. Admin commands go in commands/admin: the permission check is automatic.

## Adding an assistant tool

1. Create assistant/actions/LEVEL/NAME/action.json, a Gemini function declaration. The folder name is the function
   name.
2. Create handler.js exporting async (args, interaction, { assistant, assistantStore, config, isAdmin }) => result.
3. admin tools require an admin caller. Other levels must check permissions themselves when they act on another user.

## AI-assisted contributions

Use whatever tools you like. The rule is the same either way: you are the author, and you understand every line you
submit. You have run it, read the diff, and can explain why it is written that way.

[AGENTS.md](AGENTS.md) gives coding agents the verification commands and the safety rules. CLAUDE.md loads the same
file. Large generated pull requests nobody has read get closed without a detailed review.

## Documentation

docs/ explains the project to people running it or working on it, README.md to people discovering it.

- A doc describes the project as it is. Plans and progress notes go in issues, changes in the release notes.
- Explain why. The code already says what.
- First line is the title, then one or two sentences on what the doc answers. Add every new doc to docs/README.md.
- Kebab-case file names named after the topic.
- Cite source paths from the repository root: utilities/Notifier.js.
- English, short sentences, plain words, no em dashes, no backticks around names in prose.
- Update the doc in the same pull request as the behavior it describes.

## Releases

Maintainers only, see [docs/deployment.md](docs/deployment.md#releases).

## Security

Report vulnerabilities privately, see [SECURITY.md](SECURITY.md).
