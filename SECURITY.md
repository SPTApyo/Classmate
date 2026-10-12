# Security

Classmate holds a Discord bot token, a Gemini API key and calendar URLs that carry personal tokens. It lets
a language model act on the server, and it parses files sent by anyone. Bugs there matter, so please report them
privately.

## Reporting

Open a [private security advisory](https://github.com/SPTApyo/classmate/security/advisories/new). Do not open a
public issue. Include what an attacker controls, what they gain, and steps to reproduce.

Fixes land on main first, then in the next release.

## Supported versions

Only the latest release and main get security fixes.

## Scope

In scope:

- a user reaching a command or an assistant tool above their permission level;
- prompt injection, from a message or an attached file, that makes the assistant act on someone else's data or leak
  secrets, settings or other users' data;
- an attached file escaping the checks in utilities/fileIngest.js or the converter container;
- secrets ending up in logs, messages, the settings export or the Docker images.

Out of scope: what the model says when it is wrong without acting on anything, vulnerabilities in Discord, the calendar provider or the
timetable API, and an instance whose owner shares its tokens or settings.json.
