# Deployment

How the bot is packaged and run: the Docker images, how to configure and update a container, and how a release
reaches Docker Hub. Coming from IUT Assistant 1.7? Read [migration.md](migration.md) first.

## Images

Two images, both for linux/amd64 and linux/arm64:

| Image                      | Built from           | Contains                                       |
| -------------------------- | -------------------- | ---------------------------------------------- |
| apyo37/classmate           | Dockerfile           | Alpine, a stripped Node binary, tini and dist/ |
| apyo37/classmate-converter | converter/Dockerfile | Python slim and MarkItDown                     |

Each release is tagged X.Y.Z, X.Y, X and latest. Pin X.Y.Z in production to choose when to update.

The bot image holds no node_modules and no sources. scripts/build.mjs bundles the code and its dependencies into one
minified dist/index.js with esbuild. Handlers are loaded dynamically from disk in development, so the build replaces
utilities/moduleRegistry.js with a static table esbuild can follow. Command and action manifests are copied next to
the bundle, minified, because they are read at runtime.

The Dockerfile builds on the build platform, without emulation, since the bundle is the same for every architecture.
Only the last stage is per platform: it copies the Node binary from the official Alpine image, stripped of its debug
symbols, which saves about 15 MB.

The bot runs under tini, so signals reach Node and the bot stops cleanly. It runs as user node (uid 1000) by default,
but any uid works: the code is owned by root and read-only, and only /app/data and /app/log are writable. The bot
creates its files readable by its own uid only (600, folders 700), since they hold tokens and personal data.

## Running

docker-compose.yml runs both services. The converter sits on an internal network with no internet access, a read-only
filesystem, no capabilities and capped memory, CPU and processes. See [design.md](design.md#attached-files) for why.

```bash
docker compose pull
docker compose up -d
```

The bot needs its configuration before it starts. Two ways, which can be mixed:

- **Files**: config.json and settings.json in data/config/, secrets in data/keys/.env. See
  [configuration.md](configuration.md).
- **Environment**: every key in the environment section of docker-compose.yml, no file needed. See
  [environment.md](environment.md). The environment wins at each start.

Without either, the bot stops and says which file is missing, in the container logs and in startup-error.txt at
the root of /app/data, which a NAS file manager can open. The file is removed once the bot starts.

### Time zone

Reminders, the daily summary and the evening brief run on the container's clock, in UTC by default. Set TZ in a .env
file next to docker-compose.yml, or directly under environment:

```env
TZ=Europe/Paris
```

### Versions

TAG pins both images to a release, latest otherwise:

```bash
TAG=1.8.4 docker compose up -d
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

To start from the templates instead of the environment, copy them from the repository, or from defaults/ in the
image. persona.json is created from its template on the first start:

```bash
docker run --rm --entrypoint cat apyo37/classmate defaults/config.example.json > data/config/config.json
```

The mounted folders must be writable by the uid the container runs as, 1000 by default. Create them before the first
start: a folder Docker creates for a missing bind mount belongs to root, and the bot cannot write in it. On a NAS, run
the container as the NAS user instead, see Permissions below. Writes go through a temporary file and a
rename, so a crash never leaves a half-written file. A profile or directive file that cannot be read is moved aside
as name.corrupt-DATE and logged, never overwritten.

## Updating

```bash
docker compose pull
docker compose up -d
```

Data lives in the volumes, so an update keeps assignments, settings and profiles. Read the release notes on GitHub
before a new major version. From IUT Assistant 1.7, follow [migration.md](migration.md).

## On a NAS

### UGREEN

The Docker app of UGOS Pro accepts a docker-compose.yml: Docker > Project > Create. Use that rather than creating
containers one by one.

1. In the wizard, pick or create a storage folder for the project, for example docker/classmate on a volume, with
   read and write access. Relative paths of the compose file, such as ./data and ./log, point inside it.
2. Paste the docker-compose.yml of the repository, set the variables under environment (DISCORD_TOKEN,
   GEMINI_API_KEY, TZ, CONFIG\_\_... and SETTINGS\_\_...), and remove the two build: lines.
3. Add your NAS user under the bot service so it can write in the project folder, see Permissions below:

   ```yaml
   user: "999:10"
   ```

4. Deploy. The logs of the bot container show the startup lines, and the error line if something is missing.

To update, open the project, pull the images again and redeploy it.

If the Docker app only offers images and containers, without projects, create the containers by hand as in Without
Compose below: same images, environment variables and folders.

### Without Compose

Synology, QNAP, Portainer or any interface that creates containers one by one run the image the same way: the
environment variables of [environment.md](environment.md) go in the environment table of the
interface. Check first whether the interface accepts a docker-compose.yml (often called a project or a stack): it is
simpler.

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

These are only the required variables. Set the channels and the other keys too, see
[environment.md](environment.md#minimal-example), or the bot keeps the placeholders of the templates.

Two things to watch:

- **Permissions.** The bot runs as uid 1000 by default, while NAS folders belong to the NAS user, often another uid
  (999 with group admin, 10, on many UGREEN units). Run the container as that user: user: "UID:GID" in a compose
  file, or --user UID:GID with docker run. Find the values over SSH with id your_nas_user. Giving everyone read and
  write access to the folders in the file manager also works, but opens them to every account of the NAS.
- **The converter is optional.** Without it, PDFs go to the model as they are and Office files are refused. To add it,
  create a Docker network, start apyo37/classmate-converter on it with the container name converter, and attach the
  bot to the same network: the default URL http://converter:8080 then works. With another name or another machine,
  set CONFIG\_\_converter\_\_url, see [environment.md](environment.md#connecting-the-bot-to-the-converter). Compose also isolates the converter (no internet, read-only filesystem, memory cap); set the
  same options in the interface when it offers them.

```bash
docker network create classmate
docker run -d --name converter --network classmate --restart unless-stopped \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges --memory 512m \
  apyo37/classmate-converter:latest
docker network connect classmate classmate
```

Unlike with Compose, the converter is not on an internal network here and can reach the internet. That only matters if a malicious document
exploits a parser flaw.

## Releases

A release is a tag. Pushing vX.Y.Z runs .github/workflows/release.yml:

1. **verify**: the tag must match the version field of package.json, then npm run check and npm run build.
2. **publish**: both images built for amd64 and arm64 with Buildx and QEMU, pushed to Docker Hub.
3. **release**: a GitHub release with notes generated from the merged pull requests.

To cut a release:

```bash
npm version X.Y.Z --no-git-tag-version
git commit -am "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

Bump the version before tagging: a tag that does not match package.json fails the verify job and publishes nothing.
To retry, delete the tag on GitHub (git push origin :refs/tags/vX.Y.Z), fix package.json, then tag again.

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
