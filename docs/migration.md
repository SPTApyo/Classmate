# Migrating from 1.7

How to move an IUT Assistant 1.7 instance to Classmate 1.8 without losing assignments, profiles or settings.

## What changed

| Area                  | 1.7                                        | 1.8                                                 |
| --------------------- | ------------------------------------------ | --------------------------------------------------- |
| Bot image             | apyo37/iut_assistant                       | apyo37/classmate                                    |
| Converter image       | apyo37/iut_assistant_converter             | apyo37/classmate-converter                          |
| Data in the container | /home/node/IUT_Assistant                   | /app                                                |
| Assignments folder    | data/devoirs                               | data/assignments                                    |
| Persona and stores    | llmData.json, llmUsers.json, llmDirectives | persona.json, users.json, directives.json           |
| settings.json keys    | saeNames, trainProg, embedSAEColor, QCM    | projectSubjects, level, embedProjectsColor, quizzes |
| Dates                 | DD-MM-YYYY                                 | YYYY-MM-DD                                          |
| Default time zone     | Europe/Paris                               | UTC, set TZ                                         |
| Assistant name        | the bot's Discord nickname                 | assistantName in settings.json, Atlas when empty    |
| Commands              | /setform                                   | /setlevel                                           |

The old images are no longer on Docker Hub. A running 1.7 container keeps working, since its image is on the machine,
but it cannot be pulled or recreated anymore.

## What the bot converts by itself

On the first start of 1.8, before anything else, utilities/migrateLegacyData.js converts the 1.7 data in place:

- assignment files, with their fields and dates;
- the notifier state, so the daily summary keeps editing its messages instead of posting new ones;
- the keys of settings.json;
- the user profiles, including their level and the assignments they marked as done;
- the file names of the persona, profiles and directives, and the designer placeholders of the persona.

The log then shows a line starting with Migrated 1.7 data, listing what was converted. A second start changes nothing.
A settings.json from 1.7 imported later with /settings, or edited by hand, is converted the same way.

What the bot cannot do is reach a folder Docker does not mount. That is why the steps below rename the assignments
folder on the host and update the volume paths.

## Before you start

Back up the data folder. The migration rewrites the files in the 1.8 format, which 1.7 cannot read:

```bash
cp -a data data-backup-1.7
```

If you want a way back to 1.7, keep its image on the machine: do not run docker image prune until 1.8 works.

## With Docker Compose

1. Stop the bot and rename the assignments folder:

   ```bash
   docker compose down
   mv data/devoirs data/assignments
   ```

2. Replace docker-compose.yml with the one from the repository. If you changed yours, apply these edits instead:
   - image apyo37/iut_assistant becomes apyo37/classmate, and apyo37/iut_assistant_converter becomes
     apyo37/classmate-converter;
   - in every volume, /home/node/IUT_Assistant becomes /app;
   - the ./data/devoirs volume becomes ./data/assignments:/app/data/assignments;
   - under environment, add TZ.

3. Keep the old hours by setting the time zone in a .env file next to docker-compose.yml:

   ```env
   TZ=Europe/Paris
   ```

4. Start 1.8:

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs bot | grep -i migrated
   ```

## On a UGREEN NAS

If the 1.7 bot ran as a project (Docker > Project), apply the Docker Compose steps above to the project: rename
data/devoirs to data/assignments in the file manager, edit the compose file of the project, add TZ and a user: line
with your NAS user (see [deployment.md](deployment.md#ugreen)), remove the build: lines, then redeploy.

If it ran as a single container, follow the next section.

## Without Compose

Your configuration (server, groups, calendars, channels) and your data live in the volumes of the old container, not
in its environment. Copying the environment of the 1.7 container (DISCORD_TOKEN, GEMINI_API_KEY) into a new
container with new, empty volumes is not enough: the bot finds no config.json and stops a few seconds after starting.
Reuse the old volumes instead.

### The old container used Docker volumes

When the old container had no folders of the NAS mounted, its data sits in Docker volumes, one per folder. Look at
the volumes of the old container in the Docker app before removing it, then mount the same volumes in the new
container:

| Volume of the 1.7 container             | Mount it on in the new container |
| --------------------------------------- | -------------------------------- |
| /home/node/IUT_Assistant/data/config    | /app/data/config                 |
| /home/node/IUT_Assistant/data/devoirs   | /app/data/assignments            |
| /home/node/IUT_Assistant/data/keys      | /app/data/keys                   |
| /home/node/IUT_Assistant/data/user_data | /app/data/user_data              |
| /home/node/IUT_Assistant/log            | /app/log                         |

Stop the old container, but do not remove its volumes until the new one works. The bot converts the files in place
on its first start. Mounting the devoirs volume on /app/data/devoirs also works: the bot then copies it into
assignments and leaves a MOVED_TO_ASSIGNMENTS file in the old one.

### The old container used folders of the NAS

On a NAS interface or with docker run:

1. Stop and remove the old container. Its data stays in the folders on the NAS.
2. Rename the devoirs folder to assignments in the NAS file manager.
3. Create a container from apyo37/classmate:latest.
4. Mount the data folder on /app/data and the log folder on /app/log. Mounting the whole data folder is enough: the
   bot finds every subfolder in it, and renames devoirs to assignments itself if step 2 was skipped.
5. Add the environment variable TZ=Europe/Paris, and run the container as your NAS user if the interface allows it,
   see [deployment.md](deployment.md#on-a-nas).
6. Start it and look for the Migrated 1.7 data line in the logs.

See [deployment.md](deployment.md#without-compose) for the full command, file permissions and the converter.

## From source

Pull the repository, run npm install, then npm start. The bot renames data/devoirs itself, since it reads the folder
directly.

## After the migration

- **Assistant name.** 1.7 used the bot's Discord nickname. If your bot is not called Atlas, set assistantName in
  /settings > General, or SETTINGS\_\_assistantName in the environment. Otherwise members calling the bot by its
  name get no answer.
- **Departments.** /setdept now offers the departments listed in planning.departments, or only planning.defaultDept
  when the list is missing.
- **Tell your members** that /setform is now /setlevel, and that dates are typed as YYYY-MM-DD, for example
  2026-10-20. Their group, level and department are kept.

## If something goes wrong

When the bot stops during startup, it writes the reason in startup-error.txt at the root of the data folder, readable
from the NAS file manager, and prints it in the container logs. The first log line always shows the version, the uid
and the data path. If no startup-error.txt appears in your data folder, the folder is not mounted on /app/data.

- **Stops a few seconds after starting, even with the token**: the new container has empty volumes. Mount the
  volumes of the 1.7 container, see Without Compose above.
- **No configuration: /app/data/config/config.json is missing**: the volumes are empty or still point to
  /home/node/IUT_Assistant. Mount the 1.7 volumes on the new paths.
- **A volume is mounted on /home/node/IUT_Assistant**: a volume kept its 1.7 path. Mount it on /app instead.
- **EACCES or permission denied on /app/data**: the container cannot write in the NAS folder. Run it as the NAS user,
  see [deployment.md](deployment.md#on-a-nas).
- **The assignment list is empty**: data/devoirs was not renamed, or its volume points to the old path. Rename it and
  restart: the migration runs again on what it finds.
- **Reminders arrive one or two hours off**: TZ is not set.
- **Invalid .../settings.json**: the file has a syntax error, the line says where. Fix it, or restore it from the
  backup.

To go back to 1.7, stop the container, restore data-backup-1.7 as data, and start the old image again if it is still
on the machine.
