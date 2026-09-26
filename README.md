# IUT Assistant (Atlas)

Discord bot for IUT Blagnac students:

- **Assignment reminders**: syncs deadlines from Moodle calendars (ICS) every hour, keeps a daily summary up to date,
  pings each group before deadlines and announces new assignments.
- **Timetable watch**: announces cancelled, moved or added classes and room changes, plus an evening brief.
- **Revision quizzes**: `/quiz` turns a course file or a topic into a multiple-choice quiz.
- **Atlas**: a Gemini-powered assistant that answers in a dedicated channel and can call bot actions
  (assignments, timetables, free rooms, polls, web search).
- **English and French**: every Discord message and slash command is localized.

## Requirements

- Node.js 22+
- A Discord application with the **Message Content** intent enabled
- A Gemini API key

## Setup

```bash
npm install
cp data/config/config.example.json data/config/config.json
cp data/config/settings.example.json data/config/settings.json
```

Fill both files, then create `data/keys/.env`:

```env
DISCORD_TOKEN=...
GEMINI_API_KEY=...
```

Start the bot with `npm start`. Set `PROCESS_TEST_MODE=1` to send every reminder, alert and announcement to the test
channel only, without pinging any role.

### Configuration

Two files in `data/config/`:

**`config.json`**: read once at startup, restart to apply changes.

| Key                   | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `guildId`             | Discord server where commands are deployed |
| `directories`         | Log and data directories                   |
| `planning.apiBaseUrl` | Timetable API base URL                     |

**`settings.json`**: hot-swappable. Edit it from Discord with `/settings`, or edit the file: the bot reloads it within 5
seconds of a change, or immediately with `/reload`.
An invalid file is rejected and the previous settings stay active.

| Key                    | Purpose                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasks`                | One entry per group: `group`, Moodle `icsUrl`, `reminderChannelId`, optional `roleId` (pinged by alerts) and `trainProg` (training year for the timetable, e.g. `BUT2`) |
| `saeNames`             | Subjects shown in the S.A.E reminder                                                                                                                                    |
| `channels`             | `assistant`, `test`, `log` and optional `announcements` channel IDs                                                                                                     |
| `defaultLocale`        | `en` or `fr`, used for channel messages (reminders, Atlas)                                                                                                              |
| `adminRoles`           | Optional extra admin role IDs (see Permissions)                                                                                                                         |
| `appearance`           | Embed colors and optional footer icon (defaults to the bot avatar)                                                                                                      |
| `llm.models`           | Gemini models, ordered premium, balanced, fast                                                                                                                          |
| `location`             | Injected into the assistant system prompt                                                                                                                               |
| `community`            | Who uses the server, injected into the prompt as `[community]`                                                                                                          |
| `planning.defaultDept` | Department used by `/getroom` and the timetable watch                                                                                                                   |
| `notifications`        | Alerts and announcements (see Notifications)                                                                                                                            |

The assistant persona lives in `data/config/llmData.json` and is re-read on every request:

| Key                 | Default   | Purpose                                                                    |
| ------------------- | --------- | -------------------------------------------------------------------------- |
| `systemInstruction` |           | Persona; `[botName]`, `[dateStr]`, `[userData]` and similar are filled in  |
| `thinkingLevel`     | `minimal` | `minimal`, `low`, `medium` or `high`; thinking tokens are billed as output |
| `maxOutputTokens`   | `4096`    | Output cap per answer, thinking included                                   |
| `temperature`       | model     | Leave unset: Gemini 3 models are tuned for their default                   |

Gemini 3 models cannot turn thinking off. When a model rejects `minimal`, the bot switches that model to `low` and
remembers it. Short internal calls (ambient checks, summaries) always use the fast model with minimal thinking.

### Editing settings from Discord

`/settings` (admins only) opens a private panel: pick a section from the menu and edit it with forms and native
channel/role pickers. Every change is validated and applied immediately.

- **Export JSON** downloads the current `settings.json` (it contains calendar tokens: keep it private).
- `/settings file:<settings.json>` imports a full file at once.

### Bot name

The bot never hard-codes its name: embeds, the footer and the assistant persona use the bot's server nickname, or its
Discord username. Rename the bot in Discord and everything follows. The footer always ends with `Made by <author>`
(`author` in `package.json`). In `llmData.json`, write `[botName]` wherever the assistant refers to itself.

### Permissions

Three levels, each including the ones below it. Nothing to configure by default:

| Level     | Who                                                                                |
| --------- | ---------------------------------------------------------------------------------- |
| **owner** | Owner of the Discord application (or every member of its team), fetched at startup |
| **admin** | Members with **Manage Server** (Administrators included) or an `adminRoles` role   |
| **user**  | Everyone else                                                                      |

The folder a command or an assistant tool lives in sets the level it needs:

- `commands/<level>/<name>/`: slash commands. Owner and admin commands are hidden in Discord from members without
  **Manage Server**; the level is checked again when the command runs.
- `LLMEngine/actions/<level>/<name>/`: tools the assistant can call. The model only sees the tools the requesting
  user is allowed to use, and every call is checked again before it runs. A tool acting on someone else's data also
  checks it itself (for example, a user can only edit their own profile).

The assistant never acts on its own authority: every tool runs with the rights of the user who asked. The security
context sent with each request tells it the user's level.

- **Extra admin roles**: Discord still hides admin commands from them until you allow them in _Server Settings >
  Integrations_.
- **Designer**: the author of the project (`designer` in `package.json`), mentioned by the assistant. It is not an
  instance setting and grants no permission.

## Scripts

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `npm start`          | Run the bot from sources                            |
| `npm run build`      | Bundle and minify everything into `dist/`           |
| `npm run start:dist` | Run the bundle (`dist/index.js`, no `node_modules`) |
| `npm run lint`       | ESLint plus comment rules                           |
| `npm run format`     | Prettier                                            |
| `npm run i18n:check` | Check that locales match and every used key exists  |
| `npm run check`      | All of the above checks                             |

## Docker

```bash
docker compose up -d --build
```

Two services:

- **bot**: multi-stage build, esbuild bundles the code and its dependencies; the final image only contains Alpine, the
  Node binary and `dist/`. Volumes: `log/`, `data/config/` (config, settings, persona), `data/devoirs/`, `data/keys/`
  (`.env`), `data/user_data/`. On first run, copy the templates from `defaults/` in the image into `data/config/`.
- **converter**: [MarkItDown](https://github.com/microsoft/markitdown) service turning attached documents into Markdown
  (see below).

To publish multi-arch images instead, build both contexts with `docker buildx build --platform linux/arm64 ... --push`
(`.` for the bot, `./converter` for the converter).

## Attached files

Files sent to the assistant go through `utilities/fileIngest.js` before reaching the model:

1. **Checks**: 10 MB max, extension allow-list, real content must match the extension (magic bytes), executables and
   archives are rejected.
2. **Conversion**: PDF, DOCX, PPTX, XLSX, XLS, EPUB and HTML are converted to Markdown by the converter service, which
   costs far fewer tokens than sending the raw file. Images are sent as-is (the model reads them natively). Text and code
   files are read directly.
3. **Cleaning**: invisible and control characters removed, blank lines collapsed, size capped at 60,000 characters.
4. **Isolation**: the text is wrapped in a block marked as untrusted data, so instructions hidden in a document are not
   followed.

The converter runs in its own container: no internet access (internal network), read-only filesystem, no Linux
capabilities, 512 MB of RAM and one CPU. A parser flaw triggered by a malicious file stays inside it, away from the bot
and its tokens. If the converter is unreachable, PDFs fall back to being sent as-is and other documents are refused with
a clear message. Scanned PDFs (no text layer) are also sent as-is so the model can read the pages visually.

`converter.url` in `config.json` points to the service (`http://converter:8080` with Docker Compose).

## Notifications

Everything runs on a one-minute scheduler inside the bot; nothing is lost on restart (state is kept in
`data/devoirs/notifier-state.json`).

| What              | When                                        | Where                          | Pings the group role |
| ----------------- | ------------------------------------------- | ------------------------------ | -------------------- |
| Moodle sync       | every hour                                  | —                              | —                    |
| Daily summary     | every day at 6:00, edited in place          | group reminder channel         | no                   |
| New assignments   | after a sync finds some                     | announcements channel          | no                   |
| Deadline alerts   | `deadlineHours` before each deadline        | announcements channel          | yes                  |
| Timetable changes | every hour, current and next week           | announcements channel          | yes                  |
| Evening brief     | at `eveningBriefHour`, if classes tomorrow  | announcements channel          | no                   |
| Owner alerts      | after 3 failures in a row, then on recovery | owners by DM, else log channel | —                    |

Without an `announcements` channel, announcements go to each group's reminder channel. The timetable watch and the
evening brief only run for groups with a `trainProg`.

`notifications` in `settings.json` (also in `/settings` > Notifications):

| Key                | Default   | Meaning                                              |
| ------------------ | --------- | ---------------------------------------------------- |
| `ownerAlerts`      | `true`    | DM the owners when a calendar or the timetable fails |
| `newAssignments`   | `true`    | Announce assignments found by the hourly sync        |
| `timetableChanges` | `true`    | Announce timetable changes                           |
| `deadlineHours`    | `[24, 3]` | Hours before a deadline when alerts are sent         |
| `eveningBriefHour` | `19`      | Hour of the evening brief, `null` to turn it off     |

Details that keep it quiet and reliable:

- The first sync of a group and the first look at a timetable never announce anything.
- Deadlines keep their exact time from Moodle and are shown with Discord timestamps (each reader sees their own time
  zone). Assignments added by hand only have a date: they get one alert, at 18:00 the evening before.
- After downtime, several missed alerts for the same assignment are merged into one; a rescheduled deadline re-arms them.
- A timetable fetch that suddenly returns an empty week is ignored, and more than 15 changes at once are summarized.
- An expired Moodle token (the calendar URL returns a login page) counts as a failure, so the owners hear about it.
- A role that is not mentionable needs the bot to have the **Mention all roles** permission, otherwise the ping is silent.

### Direct messages

Discord offers no way to check whether someone accepts DMs, so the bot always sends a test message first:

- `/reminders` subscribes to the deadline alerts of your group (`/setgroup`) by DM. The confirmation DM is sent before
  anything is saved: if it fails, nothing is turned on and you are told how to open your DMs. Run it again to stop.
- `/done` marks an assignment of your group as done; it is then left out of your DM reminders.
- If someone closes their DMs later, their subscription is turned off instead of failing on every alert.
- Turning owner alerts on in `/settings` sends a test DM to the owners and is refused if none of them receives it. At
  runtime, if no owner can be reached, the alert goes to the `log` channel instead.

## Revision quizzes

`/quiz` with a course file (PDF with a text layer, DOCX, PPTX, text...), a topic, or both, and an optional number of
questions (3 to 10). The file goes through the same checks and conversion as files sent to the assistant, and its text
is passed to the model as untrusted data. Each question is posted with answer buttons; answers are private, one per
person, and the answer is revealed after 15 minutes. Malformed questions from the model are dropped.

## Ambient mode

Outside the assistant channel, the bot can join a conversation on its own when it is clearly useful, or answer when
called by name.

- **Direct call** (any channel): start a message with the bot's name, mention it, or reply to one of its messages. The
  few previous messages are added as context.
- **Ambient** (only in channels enabled in `/settings` > Ambient, off by default): the bot reads the conversation and
  decides whether to step in. For timetable, assignment or room questions it answers briefly. For learning questions it
  offers help first, and answers only if the author reacts with ✅.
- `/ambient` lets each member opt out (or back in). The bot then ignores their messages in ambient mode.

Every message goes through a cascade, cheapest first, so most of them cost no tokens:

1. **Filters** (free): watched channel, opted-out authors, very short messages.
2. **Score** (free): keywords for questions, doubt, bot topics (courses, homework, rooms, exams) and requests for help.
   Only messages reaching `minScore` become candidates.
3. **Debounce**: the bot waits for `debounceSeconds` of silence (60 s max) so a burst of messages costs one check, with
   the full exchange as context.
4. **Classifier**: a single call to the fastest model, without reasoning, returning a short JSON verdict. The bot steps
   in only above `confidence`, outside the per-channel `cooldownMinutes` and under `maxInterventionsPerHour`.
5. **Answer**: the normal assistant pipeline, with the recent conversation as context.

Context stays small: the last `contextMessages` lines (each capped at 280 characters) plus a running summary. Once 30
lines are buffered, the oldest 20 are folded into the summary by the fast model. `maxChecksPerHour` and
`dailyTokenBudget` cap the total spend; when reached, the bot stays silent until the next hour or day. Decisions are
logged with the `[ AMBIENT ]` tag, and counters appear in the bot status.

| Setting                   | Default  | Meaning                                        |
| ------------------------- | -------- | ---------------------------------------------- |
| `enabled`                 | `false`  | Master switch                                  |
| `channels`                | `[]`     | Watched channel IDs                            |
| `minScore`                | `3`      | Keyword score needed to reach the model        |
| `confidence`              | `0.75`   | Classifier confidence needed to step in        |
| `debounceSeconds`         | `20`     | Silence before checking                        |
| `cooldownMinutes`         | `5`      | Minimum gap between interventions, per channel |
| `maxChecksPerHour`        | `20`     | Classifier calls per hour                      |
| `maxInterventionsPerHour` | `4`      | Interventions per hour                         |
| `dailyTokenBudget`        | `200000` | Tokens per day for checks and summaries        |
| `contextMessages`         | `8`      | Recent lines sent as context                   |

Ambient mode needs the **Message Content** intent; offers use reactions (`GuildMessageReactions`, no portal setting).

## Project structure

```text
index.js                        Entry point: Discord events and command dispatch
commands/{owner,admin,user}/    Slash commands (command.json + handler.js)
LLMEngine/                      Gemini client, ambient mode and AI actions (actions/<level>/<name>/)
locales/                        en.json and fr.json
utilities/Notifier.js           Moodle sync, reminders, alerts, timetable watch
utilities/                      Assignments, permissions, DMs, logging, forms, i18n
converter/                      MarkItDown conversion service
scripts/                        Build and quality checks
eslint-rules/                   Custom lint rules
```

The folder of a command or an AI action sets the permission level it needs (see Permissions).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[ISC](LICENSE)
