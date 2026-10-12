# Agent instructions

How to work in this repository as a coding agent. Project documentation lives in [docs/](docs/README.md) and
[CONTRIBUTING.md](CONTRIBUTING.md); this file only covers verification, safety and which doc to read.

## Verification

Run npm run check after every change. It covers ESLint, the comment rule, Prettier and translations. Then run npm run
build: it fails when a handler cannot be bundled.

- New Discord text: add the key to both locales, npm run i18n:check catches a missing one.
- Docker changes: docker build . and docker build converter, then start the bot image once. Without config.json it
  must stop on a single readable error line.
- There is no test suite. Say what you ran and what you could not check.

Formatting belongs to Prettier: run npm run format, do not hand-format. Never add eslint-disable comments.

## Safety

- Never read, print or copy data/keys/, data/config/config.json, data/config/settings.json, data/assignments/ or
  data/user_data/. They hold tokens, calendar URLs and personal data.
- Never start the bot against a real server unless asked. When asked, set PROCESS_TEST_MODE=1.
- Never push a tag: a vX.Y.Z tag publishes images to Docker Hub.

## Committing

Do not commit, push or open a pull request unless asked. When asked, follow the commit rules in CONTRIBUTING.md; the
commit-msg hook checks them. Branch first if you are on main.

## Which doc to read

- Finding your way around: docs/repo-layout.md
- Configuration and permissions: docs/configuration.md
- How reminders, files and ambient mode behave: docs/design.md
- Docker, releases, CI: docs/deployment.md
- Commits, pull requests, comments, Discord text: CONTRIBUTING.md
- Security boundaries: SECURITY.md
