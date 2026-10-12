# Deployment

How the bot is packaged and run: the Docker images, their volumes, updates, and how a release reaches Docker Hub.

## Images

Two images, both for linux/amd64 and linux/arm64:

| Image                      | Built from           | Contains                                       |
| -------------------------- | -------------------- | ---------------------------------------------- |
| apyo37/classmate           | Dockerfile           | Alpine, a stripped Node binary, tini and dist/ |
| apyo37/classmate-converter | converter/Dockerfile | Python slim and MarkItDown                     |

Tags follow the release: 1.7.0, 1.7, 1 and latest.

The bot image holds no node_modules and no sources. scripts/build.mjs bundles the code and its dependencies into one
minified dist/index.js with esbuild. Handlers are loaded dynamically from disk in development, so the build replaces
utilities/moduleRegistry.js with a static table esbuild can follow. Command and action manifests are copied next to
the bundle, minified, because they are read at runtime.

The Dockerfile builds on the build platform, without emulation, since the bundle is the same for every architecture.
Only the last stage is per platform: it copies the Node binary from the official Alpine image, stripped of its debug
symbols, which saves about 15 MB.

The bot runs as user node (uid 1000) under tini, so signals reach Node and the bot stops cleanly.

## Running

docker-compose.yml runs both services. The converter sits on an internal network with no internet access, a read-only
filesystem, no capabilities and capped memory, CPU and processes. See [design.md](design.md#attached-files) for why.

```bash
docker compose pull
docker compose up -d
```

Reminders, the daily summary and the evening brief run on the container's clock, in UTC by default. Set TZ in a .env
file next to docker-compose.yml:

```env
TZ=Europe/Paris
```

Settings can live in the same docker-compose.yml, without any file in data/config: see
[configuration.md](configuration.md#from-docker-compose).

TAG pins both images to a release, latest otherwise:

```bash
TAG=1.7.0 docker compose up -d
```

To build the images from your checkout instead of pulling them:

```bash
docker compose up -d --build
```

### Volumes

The image declares two volumes, /app/data and /app/log. Mount /app/data as one folder, or each of its subfolders as
docker-compose.yml does:

| Path in the container | Holds                                          |
| --------------------- | ---------------------------------------------- |
| /app/data/keys        | .env with the Discord token and the Gemini key |
| /app/data/config      | config.json, settings.json, persona.json       |
| /app/data/assignments | assignments and notifier state                 |
| /app/data/user_data   | user profiles and assistant directives         |
| /app/log              | one log file per start                         |

On first run, either set the configuration from the environment, see
[configuration.md](configuration.md#from-docker-compose), or copy the templates into data/config/ from the repository,
or from defaults/ in the image:

```bash
docker run --rm --entrypoint cat apyo37/classmate defaults/config.example.json > data/config/config.json
```

The container runs as uid 1000: the mounted folders must be writable by it.

## Without Compose

On a NAS (UGREEN, Synology, QNAP), Portainer or any interface that creates containers one by one, the image works the
same: the environment variables of [configuration.md](configuration.md#from-docker-compose) go in the environment
table of the interface. Check first whether the interface accepts a docker-compose.yml (often called a project or a
stack): it is simpler.

The equivalent command:

```bash
docker run -d --name classmate --restart unless-stopped \
  -e DISCORD_TOKEN=... -e GEMINI_API_KEY=... -e TZ=Europe/Paris \
  -e CONFIG__guildId=123456789012345678 \
  -e SETTINGS__tasks__0__group=1A \
  -e SETTINGS__tasks__0__icsUrl='https://moodle.example.edu/calendar/export_execute.php?...' \
  -e SETTINGS__tasks__0__reminderChannelId=123456789012345678 \
  -v /volume1/docker/classmate/data:/app/data \
  -v /volume1/docker/classmate/log:/app/log \
  apyo37/classmate:latest
```

Two things to watch:

- **Permissions.** The bot runs as uid 1000. NAS shared folders often belong to another user, and the bot then cannot
  write its data. Give read and write access on the folders to everyone in the NAS file manager, or run the container
  with your own uid if the interface allows it.
- **The converter is optional.** Without it, PDFs go to the model as they are and Office files are refused. To add it,
  create a Docker network, start apyo37/classmate-converter on it with the container name converter, and attach the
  bot to the same network: the default URL http://converter:8080 then works. With another name, set
  CONFIG__converter__url. Compose also isolates the converter (no internet, read-only filesystem, memory cap); set the
  same options in the interface when it offers them.

```bash
docker network create classmate
docker run -d --name converter --network classmate --restart unless-stopped \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 512m \
  apyo37/classmate-converter:latest
docker network connect classmate classmate
```

Without the converter on an internal network, it can reach the internet. That only matters if a malicious document
exploits a parser flaw.

### Updating

```bash
docker compose pull
docker compose up -d
```

Data lives in the volumes, so an update keeps assignments, settings and profiles.

### Upgrading from 1.7

Version 1.7 used French names (data/devoirs, saeNames, trainProg) and Gemini-specific file names (llmData.json,
llmUsers.json). The bot converts everything on its first start: assignment files, notifier state, settings.json, user
profiles and the persona. The log says what was migrated.

Dates move from DD-MM-YYYY to YYYY-MM-DD, and the designer's first name leaves the persona.

The default time zone is now UTC instead of Europe/Paris: add TZ=Europe/Paris to the .env next to
docker-compose.yml to keep the old hours.

The image also moved from apyo37/iut_assistant to apyo37/classmate, and its data from /home/node/IUT_Assistant to
/app. Take the new docker-compose.yml from the repository, or update the image names and volume paths in yours.

With Docker, rename the host folder first, since the volume path changed:

```bash
docker compose down
mv data/devoirs data/assignments
docker compose pull
docker compose up -d
```

From source, the bot renames the folder itself.

## Releases

A release is a tag. Pushing vX.Y.Z runs .github/workflows/release.yml:

1. **verify**: the tag must match the version field of package.json, then npm run check and npm run build.
2. **publish**: both images built for amd64 and arm64 with Buildx and QEMU, pushed to Docker Hub.
3. **release**: a GitHub release with notes generated from the merged pull requests.

To cut a release:

```bash
npm version 1.8.0 --no-git-tag-version
git commit -am "chore: release v1.8.0"
git tag v1.8.0
git push origin main v1.8.0
```

The version shown by /about and the bot status comes from package.json, bundled at build time.

### Docker Hub access

The workflow logs in as apyo37 with a Docker Hub access token stored in the repository secret DOCKERHUB_TOKEN. Create
the token on Docker Hub with Read and Write scope, then:

```bash
gh secret set DOCKERHUB_TOKEN
```

## Continuous integration

.github/workflows/ci.yml runs on every pull request and on main:

- **commit messages**: commitlint over every commit of the pull request.
- **lint, format, i18n, build**: npm run check, then npm run build.
- **docker build**: both images built, nothing pushed.

Build layers are cached in the GitHub Actions cache, one scope per image. Dependabot keeps npm packages, base images
and actions up to date (.github/dependabot.yml). Actions are pinned to a commit, with the version in a comment.
