# Contributing

## Workflow

1. `npm install` (installs the git hooks).
2. Create a branch, make your change.
3. Run `npm run check` before pushing.

Hooks run automatically:

- `pre-commit`: ESLint, comment rules and Prettier on staged files, i18n check on locale changes.
- `commit-msg`: commitlint.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`

- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`
- Scopes: `bot`, `llm`, `commands`, `actions`, `devoirs`, `i18n`, `docker`, `deps`, `config`, `tooling`

Example: `fix(commands): handle empty groups in /list`

## Code comments

Enforced by `eslint-rules/max-comment-words.js`:

- **8 words maximum** per comment.
- **English only**.
- Explain **why**, never **what changed**. History belongs in commit messages, not in the code.
  - Good: `// Bulk delete skips messages older than 14 days.`
  - Bad: `// Removed the old log because it crashed the bot`
- No comment when the code is self-explanatory. Prefer a clear name over a comment.

## Logs and user-facing text

- **Logs are in English**, prefixed with a tag: `[ SUCCESS ]`, `[ ERROR ]`, `[ NOTICE ]`, optionally `[ GEMINI ]` or
  `[ LLMDATA ]`.
- **Discord messages are never hard-coded.** Add a key to both `locales/en.json` and `locales/fr.json`, then use the
  translator:
  - Slash commands: `deps.t("key", { param })` (uses the user's Discord locale).
  - Channel messages: `translator()` from `utilities/i18n.js` (uses `config.defaultLocale`).
  - Errors shown to users: `throw userError("key", params)`.
- Slash command descriptions go in `command.json` with `description_localizations.fr`.
- AI action results (`LLMEngine/actions`) are read by the model only: keep them in English, no i18n.

## Adding a slash command

1. Create `commands/<admin|user>/<name>/command.json` (folder name = command name).
2. Create `handler.js` exporting `async (interaction, deps) => {}`.
3. Admin commands go in `commands/admin`: the role check is automatic.

## Adding an AI action

1. Create `LLMEngine/actions/<admin|model|user|web>/<name>/action.json` (Gemini function declaration, folder name =
   function name).
2. Create `handler.js` exporting `async (args, interaction, { llmClient, llmDataManager, config, isAdmin }) => result`.
3. `admin` actions require an admin caller. Other categories must check permissions themselves when they act on
   another user.
