# Repository layout

Where everything lives, and which file to open first for a given change.

## Top level

- index.js: entry point. Loads the configuration, creates the Discord client, wires events to commands, the
  assistant and the notifier.
- commands/LEVEL/NAME/: slash commands, one folder each with command.json and handler.js. The level folder (owner,
  admin, user) sets who may run it, see [configuration.md](configuration.md#permissions).
- assistant/: the AI assistant (Assistant.js, the Gemini client and tool loop), its store of persona, profiles and
  directives (AssistantStore.js), ambient mode (ambient/) and the tools the model can call (actions/LEVEL/NAME/).
- utilities/: everything shared: assignments, notifications, permissions, DMs, logging, forms, i18n, file checks.
- locales/: en.json and fr.json, every message the bot sends.
- converter/: the MarkItDown service turning documents into Markdown.
- data/: runtime configuration and data. Only the *.example.json templates and persona.json are tracked.
- scripts/: the build and the quality checks.
- eslint-rules/: the custom comment rule.
- .github/: CI, release, Dependabot, issue and pull request templates.

## Where to start

| Change                                            | Start in                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| A new slash command                               | commands/user/ or commands/admin/, then locales/                    |
| A new assistant tool                              | assistant/actions/, see CONTRIBUTING.md                             |
| Calendar sync, reminders, alerts, timetable watch | utilities/Notifier.js                                               |
| Assignment storage, IDs, sorting                  | utilities/AssignmentManager.js                                      |
| Picking a group or an assignment in a form        | utilities/AssignmentPrompts.js                                      |
| Timetable and free rooms API                      | utilities/TimetableApi.js                                           |
| Who may run what                                  | utilities/permissions.js                                            |
| Assistant prompt, models, tool loop               | assistant/Assistant.js                                              |
| Ambient mode                                      | assistant/ambient/AmbientEngine.js, assistant/ambient/heuristics.js |
| Attached files                                    | utilities/fileIngest.js, converter/server.py                        |
| Settings panel, forms                             | commands/admin/settings/, utilities/EmbedFormManager.js             |
| Loading and validating settings                   | utilities/config.js                                                 |
| Settings from environment variables               | utilities/envOverrides.js                                           |
| Converting 1.7 data on startup                    | utilities/migrateLegacyData.js                                      |
| Safe JSON reads and writes                        | utilities/jsonFile.js                                               |
| Direct messages                                   | utilities/dm.js                                                     |
| Failure alerts to owners                          | utilities/health.js                                                 |
| Logs                                              | utilities/Logger.js                                                 |
| Translations                                      | locales/, utilities/i18n.js                                         |
| Command deployment to Discord                     | utilities/CommandDeployer.js                                        |
| Bundle, Docker image                              | scripts/build.mjs, Dockerfile                                       |
