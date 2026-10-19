# Configuration

What each configuration file holds, how to edit it, and who is allowed to do what.

## Files

Everything lives in data/, mounted as volumes in Docker:

- data/keys/.env: secrets, read once at startup.
- data/config/config.json: instance setup, read once at startup. Restart to apply changes.
- data/config/settings.json: hot-swappable settings.
- data/config/persona.json: the assistant persona, re-read on every request.

Templates for the three JSON files sit next to them as *.example.json, and in defaults/ inside the Docker image.
Everything can also come from environment variables, see From docker-compose.

### .env

```env
DISCORD_TOKEN=...
GEMINI_API_KEY=...
```

### config.json

| Key                 | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| guildId             | Discord server where commands are deployed                   |
| directories         | Log and data directories                                     |
| planning.apiBaseUrl | Timetable API base URL, see Timetable API below              |
| planning.paths      | Optional schedules and freeRooms paths on that API           |
| converter.url       | Converter service, http://converter:8080 with Docker Compose |

### settings.json

Edit it from Discord with /settings, or edit the file: the bot reloads it within 5 seconds of a change, or immediately
with /reload. An invalid file is rejected and the previous settings stay active.

| Key                  | Purpose                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| assistantName        | Name of the assistant, Atlas when empty, see Assistant name                                                                                                                  |
| tasks                | One entry per group: group, calendar icsUrl, reminderChannelId, optional roleId (pinged by alerts) and level (year of study as the timetable API names it, for example BUT2) |
| projectSubjects      | Subjects whose assignments go in the projects reminder                                                                                                                       |
| channels             | assistant, test, log and optional announcements channel IDs                                                                                                                  |
| defaultLocale        | en or fr, used for channel messages (reminders, assistant)                                                                                                                   |
| adminRoles           | Optional extra admin role IDs, see Permissions                                                                                                                               |
| appearance           | Embed colors and optional footer icon (defaults to the bot avatar)                                                                                                           |
| llm.models           | Gemini models, ordered premium, balanced, fast                                                                                                                               |
| location             | Injected into the assistant system prompt                                                                                                                                    |
| community            | Who uses the server, injected into the prompt as [community]                                                                                                                 |
| planning.defaultDept | Department used by /getroom and the timetable watch                                                                                                                          |
| planning.departments | Departments offered by /setdept                                                                                                                                              |
| notifications        | Alerts and announcements, see [design.md](design.md#notifications)                                                                                                           |
| ambient              | Ambient mode, see [design.md](design.md#ambient-mode)                                                                                                                        |

### persona.json

| Key               | Default | Purpose                                                                                                                                                                                    |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| systemInstruction |         | Persona; [botName], [dateStr], [weekStr] and similar are filled in. Keep it free of per-message values (time, user, channel): those come with each message, so Gemini can cache the prompt |
| thinkingLevel     | minimal | minimal, low, medium or high; thinking tokens are billed as output                                                                                                                         |
| maxOutputTokens   | 4096    | Output cap per answer, thinking included                                                                                                                                                   |
| temperature       | model   | Leave unset: Gemini 3 models are tuned for their default                                                                                                                                   |

Gemini 3 models cannot turn thinking off. When a model rejects minimal, the bot switches that model to low and
remembers it. Short internal calls (ambient checks, summaries) always use the fast model with minimal thinking.

### Timetable API

The timetable watch, the evening brief, /getroom and the assistant's timetable tools read an HTTP API with two
endpoints, called by utilities/TimetableApi.js. Their paths default to the ones below and can be changed with
planning.paths in config.json:

- GET /api/get-schedules?year=&week=&dept=&train_prog=&groupe= returns an array of courses. Each course has an id, a
  date with year, week and day (m, tu, w, th, f, sa, su), a start_time and a duration in minutes, a room, and a
  course object with name, abbrev and type.
- GET /api/get-free-rooms?year=&week=&dept= returns { salles: { day: { startMinutes: [rooms] } }, lastUpdated }.

The parameter names and the response shape come from flop!EDT, which the original instance wraps. Another
timetable system needs a small proxy that answers in this format. Without such an API, leave level unset
on every group: the timetable watch and the evening brief then stay off, and the rest of the bot works.

## From docker-compose

Every key of config.json, settings.json and persona.json can also be set from environment variables, so a deployment
can live in docker-compose.yml or in the environment table of a NAS interface. [environment.md](environment.md) lists
every variable, its default and which ones a new instance needs.

## Editing settings from Discord

/settings (admins only) opens a private panel: pick a section from the menu and edit it with forms and native
channel and role pickers. Every change is validated and applied immediately.

- **Export JSON** downloads the current settings.json. It contains calendar tokens: keep it private.
- /settings file:settings.json imports a full file at once.

## Assistant name

The assistant is called Atlas by default. Set assistantName in settings.json, or the first field of /settings >
General, to rename it. Embeds, the footer, the persona and direct calls ("Atlas, ...") all follow, without a restart.
The Discord username of the bot does not matter.

The footer always ends with "Made by" and the author field of package.json. In persona.json, write [botName] wherever
the assistant refers to itself.

## Permissions

Three levels, each including the ones below it. Nothing to configure by default:

| Level     | Who                                                                                |
| --------- | ---------------------------------------------------------------------------------- |
| **owner** | Owner of the Discord application (or every member of its team), fetched at startup |
| **admin** | Members with **Manage Server** (Administrators included) or an adminRoles role     |
| **user**  | Everyone else                                                                      |

The folder a command or an assistant tool lives in sets the level it needs:

- commands/LEVEL/NAME/: slash commands. Owner and admin commands are hidden in Discord from members without
  **Manage Server**; the level is checked again when the command runs.
- assistant/actions/LEVEL/NAME/: tools the assistant can call. The model only sees the tools the requesting user is
  allowed to use, and every call is checked again before it runs. A tool acting on someone else's data also checks it
  itself (for example, a user can only edit their own profile).

The assistant never acts on its own authority: every tool runs with the rights of the user who asked. The security
context sent with each request tells it the user's level.

- **Extra admin roles**: Discord still hides admin commands from them until you allow them in _Server Settings >
  Integrations_.
- **Designer**: the author of the project (designer in package.json), mentioned by the assistant. It is not an
  instance setting and grants no permission.
