# Environment variables

Every variable the two images read, with its default and what breaks without it. Use it to run the bot from the
environment section of docker-compose.yml, or from the environment table of a NAS interface, without any file.

Variables marked \* are required for a new instance: without them the bot does not start, or starts without its main
features. An instance that already has config.json, settings.json and data/keys/.env in its volume needs none of them,
not even the secrets: the environment only overrides what is in the files.

## How it works

- The prefix picks the file: CONFIG for config.json, SETTINGS for settings.json, PERSONA for persona.json.
- Double underscores go one level down. A number is an array index: SETTINGS\_\_tasks\_\_0\_\_group is the group of
  the first task, SETTINGS\_\_tasks\_\_1\_\_group the group of the second.
- A value that is valid JSON is read as JSON: numbers, true, false, null, arrays and objects. Write arrays between
  single quotes in YAML: '["A","B"]'. Anything else stays text. A key that holds text in the file or the template stays
  text, so Discord IDs and group names never turn into numbers.
- On each start, the variables are written into the files, which are created from the templates when missing. Edits
  made with /settings apply right away, but a restart puts back the values of the environment. Keys not set in the
  environment keep their value from the file.
- The log lists the keys taken from the environment, never their values.

Starting from the templates, a key you do not set keeps the placeholder of the template, such as <CHANNEL_ID>. The bot
starts, but the feature using that key does not work. Set or empty at least the channels, the level of each group,
the timetable API and the departments.

## Bot: apyo37/classmate

### Secrets and system

| Variable          | Default | Purpose                                                                                   |
| ----------------- | ------- | ----------------------------------------------------------------------------------------- |
| DISCORD_TOKEN \*  |         | Bot token. Without it the bot stops on startup                                            |
| GEMINI_API_KEY \* |         | Gemini API key. Without it the bot starts, but the assistant, /quiz and ambient mode fail |
| TZ                | UTC     | Time zone of the reminders, the daily summary and the evening brief, such as Europe/Paris |
| PROCESS_TEST_MODE |         | 1 sends every reminder, alert and announcement to the test channel only, without pings    |

The two secrets can also stay in data/keys/.env. A variable of the environment wins over the file.

### config.json

Read once at startup: restart to apply a change.

| Variable                                 | Default               | Purpose                                                                        |
| ---------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| CONFIG\_\_guildId \*                     | placeholder           | Discord server ID. Without it no slash command is deployed                     |
| CONFIG\_\_converter\_\_url               | http://converter:8080 | Address of the converter service                                               |
| CONFIG\_\_planning\_\_apiBaseUrl         | placeholder           | Timetable API base URL, see [configuration.md](configuration.md#timetable-api) |
| CONFIG\_\_planning\_\_paths\_\_schedules | /api/get-schedules    | Path of the courses endpoint                                                   |
| CONFIG\_\_planning\_\_paths\_\_freeRooms | /api/get-free-rooms   | Path of the free rooms endpoint                                                |
| CONFIG\_\_directories\_\_logDirectory    | ./log                 | Log folder. Leave it in Docker                                                 |
| CONFIG\_\_directories\_\_dataDirectory   | ./data                | Data folder. Leave it in Docker                                                |

### settings.json

Also editable from Discord with /settings.

**Groups.** One block per group, numbered from 0.

| Variable                                       | Default     | Purpose                                                                 |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| SETTINGS\_\_tasks\_\_0\_\_icsUrl \*            | example URL | ICS calendar of the group, from Moodle for example                      |
| SETTINGS\_\_tasks\_\_0\_\_reminderChannelId \* | placeholder | Channel of the daily summary                                            |
| SETTINGS\_\_tasks\_\_0\_\_group                | 1A          | Group name: letters, digits, - and \_, 32 characters at most            |
| SETTINGS\_\_tasks\_\_0\_\_roleId               | empty       | Role pinged by the alerts                                               |
| SETTINGS\_\_tasks\_\_0\_\_level                | placeholder | Level for the timetable, such as BUT2. "" turns the timetable watch off |

**Assistant and server.**

| Variable                              | Default             | Purpose                                                      |
| ------------------------------------- | ------------------- | ------------------------------------------------------------ |
| SETTINGS\_\_assistantName             | Atlas               | Name of the assistant, used in embeds and direct calls       |
| SETTINGS\_\_defaultLocale             | en                  | en or fr, for channel messages                               |
| SETTINGS\_\_location                  | placeholder         | City and country, given to the assistant                     |
| SETTINGS\_\_community                 | placeholder         | Who uses the server, given to the assistant                  |
| SETTINGS\_\_channels\_\_assistant     | placeholder         | Channel where the assistant answers every message            |
| SETTINGS\_\_channels\_\_announcements | placeholder         | Alerts and announcements. Empty: each group's channel        |
| SETTINGS\_\_channels\_\_log           | placeholder         | Channel of the errors                                        |
| SETTINGS\_\_channels\_\_test          | placeholder         | Channel used by PROCESS_TEST_MODE                            |
| SETTINGS\_\_adminRoles                | []                  | Extra admin roles, such as '["123456789012345678"]'          |
| SETTINGS\_\_projectSubjects           | placeholder         | Subjects of the projects reminder, such as '["DevApp"]'      |
| SETTINGS\_\_llm\_\_models             | three Gemini models | Models ordered premium, balanced, fast                       |
| SETTINGS\_\_planning\_\_defaultDept   | placeholder         | Department of /getroom and the timetable watch, such as INFO |
| SETTINGS\_\_planning\_\_departments   | placeholder         | Choices of /setdept, such as '["INFO","GIM"]'                |

**Colors.**

| Variable                                        | Default        | Purpose                    |
| ----------------------------------------------- | -------------- | -------------------------- |
| SETTINGS\_\_appearance\_\_embedGlobalColor      | 0x23eb6d       | Most embeds                |
| SETTINGS\_\_appearance\_\_embedAssignmentsColor | 0xd830ef       | Assignments of the summary |
| SETTINGS\_\_appearance\_\_embedQuizzesColor     | 0x87ceeb       | Quizzes of the summary     |
| SETTINGS\_\_appearance\_\_embedProjectsColor    | 0xf02247       | Projects of the summary    |
| SETTINGS\_\_appearance\_\_embedFooterIconUrl    | the bot avatar | Footer icon, an https URL  |

**Notifications.** See [design.md](design.md#notifications).

| Variable                                      | Default | Purpose                                        |
| --------------------------------------------- | ------- | ---------------------------------------------- |
| SETTINGS\_\_notifications\_\_ownerAlerts      | true    | DM the owners when a calendar or the API fails |
| SETTINGS\_\_notifications\_\_newAssignments   | true    | Announce assignments found by the hourly sync  |
| SETTINGS\_\_notifications\_\_timetableChanges | true    | Announce timetable changes                     |
| SETTINGS\_\_notifications\_\_deadlineHours    | [24,3]  | Hours before a deadline when alerts are sent   |
| SETTINGS\_\_notifications\_\_eveningBriefHour | 19      | Hour of the evening brief, null turns it off   |

**Ambient mode.** See [design.md](design.md#ambient-mode).

| Variable                                       | Default | Purpose                                 |
| ---------------------------------------------- | ------- | --------------------------------------- |
| SETTINGS\_\_ambient\_\_enabled                 | false   | Master switch                           |
| SETTINGS\_\_ambient\_\_channels                | []      | Watched channel IDs                     |
| SETTINGS\_\_ambient\_\_minScore                | 3       | Keyword score needed to reach the model |
| SETTINGS\_\_ambient\_\_confidence              | 0.75    | Classifier confidence needed to step in |
| SETTINGS\_\_ambient\_\_debounceSeconds         | 20      | Silence before checking                 |
| SETTINGS\_\_ambient\_\_cooldownMinutes         | 5       | Gap between interventions, per channel  |
| SETTINGS\_\_ambient\_\_maxChecksPerHour        | 20      | Classifier calls per hour               |
| SETTINGS\_\_ambient\_\_maxInterventionsPerHour | 4       | Interventions per hour                  |
| SETTINGS\_\_ambient\_\_dailyTokenBudget        | 200000  | Tokens per day for checks and summaries |
| SETTINGS\_\_ambient\_\_contextMessages         | 8       | Recent lines sent as context            |

### persona.json

Re-read on every request. The environment is applied at startup.

| Variable                     | Default         | Purpose                                                          |
| ---------------------------- | --------------- | ---------------------------------------------------------------- |
| PERSONA\_\_thinkingLevel     | minimal         | minimal, low, medium or high. Thinking tokens are billed         |
| PERSONA\_\_maxOutputTokens   | 4096            | Output cap per answer, thinking included                         |
| PERSONA\_\_temperature       | the model's     | Leave unset: Gemini 3 models are tuned for their default         |
| PERSONA\_\_systemInstruction | shipped persona | The whole prompt. Too long for a variable: edit the file instead |

## Converter: apyo37/classmate-converter

Nothing is required: the converter runs without any variable.

| Variable         | Default  | Purpose                                                               |
| ---------------- | -------- | --------------------------------------------------------------------- |
| PORT             | 8080     | Listening port. Change CONFIG\_\_converter\_\_url on the bot to match |
| MAX_BYTES        | 10485760 | Largest file accepted, 10 MB like the bot's own limit                 |
| MAX_OUTPUT_CHARS | 500000   | Largest Markdown output                                               |

## Connecting the bot to the converter

The address and the port of the converter are one setting on the bot side, CONFIG\_\_converter\_\_url, a full URL
with the port. The PORT variable of the converter only changes where it listens: both must agree.

| Setup                                               | CONFIG\_\_converter\_\_url            |
| --------------------------------------------------- | ------------------------------------- |
| docker-compose.yml of the repository                | default, nothing to set               |
| Same Docker network, container named converter      | default, nothing to set               |
| Same Docker network, another container name         | http://NAME:8080                      |
| Converter started with PORT=9000                    | http://converter:9000                 |
| Another machine, or no shared network (port mapped) | http://192.168.1.20:8080, the host IP |

Without a shared network, publish the converter port (-p 8080:8080, or the port mapping of the NAS interface) and use
the IP of the machine running it. The converter then accepts files from anyone on the local network: keep that port
closed to the internet. Without any converter, the bot still runs: PDFs go to the model as they are and Office files
are refused.

## Compose only

TAG, in the .env file next to docker-compose.yml, picks the version of both images. It is read by Docker Compose, not
by the containers.

## Minimal example

A new instance from the environment alone:

```yaml
environment:
  DISCORD_TOKEN: ...
  GEMINI_API_KEY: ...
  TZ: Europe/Paris
  CONFIG__guildId: "123456789012345678"
  SETTINGS__defaultLocale: fr
  SETTINGS__tasks__0__group: 1A
  SETTINGS__tasks__0__icsUrl: https://moodle.example.edu/calendar/export_execute.php?...
  SETTINGS__tasks__0__reminderChannelId: "123456789012345678"
  SETTINGS__tasks__0__level: ""
  SETTINGS__channels__assistant: "123456789012345678"
  SETTINGS__channels__announcements: ""
  SETTINGS__channels__log: "123456789012345678"
  SETTINGS__channels__test: "123456789012345678"
```
