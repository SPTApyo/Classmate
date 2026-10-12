<p align="center">
  <img src=".github/assets/banner.svg" alt="Classmate" width="100%" />
</p>

<p align="center">
<em>a Discord bot that keeps a class on top of its deadlines, with an AI assistant</em>
</p>

<hr/>
<br/>

<p align="center">
  <a href="https://github.com/SPTApyo/classmate/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/SPTApyo/classmate/ci.yml?style=flat-square&label=CI&color=11998e&labelColor=333333" /></a>
  <a href="https://github.com/SPTApyo/classmate/releases"><img alt="Version" src="https://img.shields.io/github/v/tag/SPTApyo/classmate?style=flat-square&label=Version&color=24c486&labelColor=333333" /></a>
  <a href="https://hub.docker.com/r/apyo37/classmate"><img alt="Docker Hub" src="https://img.shields.io/docker/image-size/apyo37/classmate?style=flat-square&label=Image&color=38ef7d&labelColor=333333" /></a>
  <a href="https://github.com/SPTApyo/classmate/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/SPTApyo/classmate.svg?style=flat-square&label=License&color=11998e&labelColor=333333" /></a>
  <a href="https://github.com/SPTApyo/classmate/commits/main"><img alt="Updated" src="https://img.shields.io/github/last-commit/SPTApyo/classmate.svg?style=flat-square&label=Updated&color=24c486&labelColor=333333" /></a>
</p>

**Classmate** is a Discord bot for a class of students. It reads the calendar of each group (an ICS export, from Moodle for example), keeps
a daily summary of what is due, pings the group before each deadline and watches the timetable for cancelled or moved
classes. In a dedicated channel, an AI assistant (Google Gemini), called Atlas by default, answers questions and acts on the bot's data
with the rights of the person asking.

## Features

- **Assignment reminders**: deadlines synced from the calendars every hour, a daily summary edited in place, alerts before
  each deadline and announcements for new assignments.
- **Timetable watch**: cancelled, moved or added classes and room changes, plus an evening brief.
- **Revision quizzes**: /quiz turns a course file or a topic into a multiple-choice quiz.
- **Assistant**: Atlas by default, renamed with one setting. It answers in its channel, or joins a conversation on its own when it is clearly useful. It can manage
  assignments, read timetables, find free rooms, create polls and search the web.
- **Attached files**: PDF, Office documents and images, checked and converted in an isolated container.
- **Settings from Discord**: /settings edits the configuration live, no restart.
- **English and French**: every message and slash command is localized.

# Getting Started

You need a Discord application with the **Message Content** intent enabled and a Gemini API key.

## Installation

Images for amd64 and arm64 (a Raspberry Pi works) are published on Docker Hub:

- [apyo37/classmate](https://hub.docker.com/r/apyo37/classmate): the bot
- [apyo37/classmate-converter](https://hub.docker.com/r/apyo37/classmate-converter): the document converter

With Docker Compose:

```bash
git clone https://github.com/SPTApyo/classmate.git
cd classmate
cp data/config/config.example.json data/config/config.json
cp data/config/settings.example.json data/config/settings.json
mkdir -p data/keys
printf 'DISCORD_TOKEN=...\nGEMINI_API_KEY=...\n' > data/keys/.env
docker compose pull
docker compose up -d
```

Fill config.json and settings.json first, see [docs/configuration.md](docs/configuration.md). Or skip the files
entirely and set everything in the environment section of docker-compose.yml, see
[From docker-compose](docs/configuration.md#from-docker-compose). Set TAG to pin a version, for example TAG=1.8.2
docker compose up -d.

From source, with Node.js 22 or later:

```bash
npm install
npm start
```

[docs/deployment.md](docs/deployment.md) covers volumes, the time zone, updates, NAS setups without Compose and
building the images yourself. Running IUT Assistant 1.7? Follow [docs/migration.md](docs/migration.md).

# Usage

| Command                        | What it does                                        |
| ------------------------------ | --------------------------------------------------- |
| /setgroup, /setlevel, /setdept | Tell the bot your group, level and department       |
| /list                          | Assignments of a group                              |
| /add, /edit, /done             | Add or edit an assignment, mark one as done for you |
| /reminders                     | Deadline reminders for your group by DM             |
| /getroom                       | Free rooms for the nearest time slot                |
| /quiz                          | Revision quiz from a file or a topic                |
| /chat                          | Talk to the assistant, optionally with a file       |
| /ambient                       | Let the assistant join your conversations, or not   |
| /settings                      | Edit the bot settings (admins)                      |

Set PROCESS_TEST_MODE=1 to send every reminder, alert and announcement to the test channel only, without pinging
anyone.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) to set up the project, and [docs/](docs/README.md) for how it works.

# Community

For bugs, feature requests and contributions, please use the
[Issue Tracker](https://github.com/SPTApyo/classmate/issues).

Made with ❤️ by [SPTApyo](https://github.com/SPTApyo).

# License

This software is distributed under the **GNU GPL-3.0-or-later**. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 SPTApyo
