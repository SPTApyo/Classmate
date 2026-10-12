# Design

How the bot behaves once it runs, and why it was built that way: notifications, direct messages, attached files,
quizzes and ambient mode.

## Notifications

Everything runs on a one-minute scheduler inside the bot. Nothing is lost on restart: state is kept in
data/assignments/notifier-state.json. The code lives in utilities/Notifier.js.

| What              | When                                        | Where                          | Pings the group role |
| ----------------- | ------------------------------------------- | ------------------------------ | -------------------- |
| Calendar sync     | every hour                                  | -                              | -                    |
| Daily summary     | every day at 6:00, edited in place          | group reminder channel         | no                   |
| New assignments   | after a sync finds some                     | announcements channel          | no                   |
| Deadline alerts   | deadlineHours before each deadline          | announcements channel          | yes                  |
| Timetable changes | every hour, current and next week           | announcements channel          | yes                  |
| Evening brief     | at eveningBriefHour, if classes tomorrow    | announcements channel          | no                   |
| Owner alerts      | after 3 failures in a row, then on recovery | owners by DM, else log channel | -                    |

The daily summary has three embeds, each shown only when it has something:

- **assignments**: everything due within a week;
- **quizzes**: calendar events whose title says the quiz closes ("closes", or "se termine" in French Moodle), within a
  month;
- **projects**: assignments whose subject is in projectSubjects, within a month.

Without an announcements channel, announcements go to each group's reminder channel. The timetable watch and the
evening brief only run for groups with a level.

notifications in settings.json (also in /settings > Notifications):

| Key              | Default | Meaning                                              |
| ---------------- | ------- | ---------------------------------------------------- |
| ownerAlerts      | true    | DM the owners when a calendar or the timetable fails |
| newAssignments   | true    | Announce assignments found by the hourly sync        |
| timetableChanges | true    | Announce timetable changes                           |
| deadlineHours    | [24, 3] | Hours before a deadline when alerts are sent         |
| eveningBriefHour | 19      | Hour of the evening brief, null to turn it off       |

What keeps it quiet and reliable:

- The first sync of a group and the first look at a timetable never announce anything.
- Any ICS calendar works. Moodle puts the course in the CATEGORIES field, which becomes the subject; events without
  it use the group name as subject.
- Deadlines keep their exact time from the calendar and are shown with Discord timestamps, so each reader sees their own
  time zone. Assignments added by hand only have a date: they get one alert, at 18:00 the evening before.
- After downtime, several missed alerts for the same assignment are merged into one. A rescheduled deadline re-arms
  them.
- A timetable fetch that suddenly returns an empty week is ignored, and more than 15 changes at once are summarized.
- An expired calendar token (the URL returns a login page instead of a calendar) counts as a failure, so the owners hear about it.
- A role that is not mentionable needs the bot to have the **Mention all roles** permission, otherwise the ping is
  silent.

## Direct messages

Discord offers no way to check whether someone accepts DMs, so the bot always sends a test message first:

- /reminders subscribes to the deadline alerts of your group (/setgroup) by DM. The confirmation DM is sent before
  anything is saved: if it fails, nothing is turned on and you are told how to open your DMs. Run it again to stop.
- /done marks an assignment of your group as done. It is then left out of your DM reminders.
- If someone closes their DMs later, their subscription is turned off instead of failing on every alert.
- Turning owner alerts on in /settings sends a test DM to the owners and is refused if none of them receives it. At
  runtime, if no owner can be reached, the alert goes to the log channel instead.

## Attached files

Files sent to the assistant go through utilities/fileIngest.js before reaching the model:

1. **Checks**: 10 MB max, extension allow-list, real content must match the extension (magic bytes), executables and
   archives are rejected.
2. **Conversion**: PDF, DOCX, PPTX, XLSX, XLS, EPUB and HTML are converted to Markdown by the converter service, which
   costs far fewer tokens than sending the raw file. Images are sent as they are, the model reads them natively. Text
   and code files are read directly.
3. **Cleaning**: invisible and control characters removed, blank lines collapsed, size capped at 60,000 characters.
4. **Isolation**: the text is wrapped in a block marked as untrusted data, so instructions hidden in a document are not
   followed.

The converter ([MarkItDown](https://github.com/microsoft/markitdown), converter/server.py) runs in its own container:
no internet access (internal network), read-only filesystem, no Linux capabilities, 512 MB of RAM and one CPU. A
parser flaw triggered by a malicious file stays inside it, away from the bot and its tokens.

If the converter is unreachable, PDFs fall back to being sent as they are and other documents are refused with a clear
message. Scanned PDFs (no text layer) are also sent as they are, so the model can read the pages visually.

## Revision quizzes

/quiz takes a course file (PDF with a text layer, DOCX, PPTX, text...), a topic, or both, and an optional number of
questions (3 to 10). The file goes through the same checks and conversion as files sent to the assistant, and its text
is passed to the model as untrusted data. Each question is posted with answer buttons. Answers are private, one per
person, and the answer is revealed after 15 minutes. Malformed questions from the model are dropped.

## Ambient mode

Outside the assistant channel, the bot can join a conversation on its own when it is clearly useful, or answer when
called by name. The code lives in assistant/ambient/.

- **Direct call** (any channel): start a message with the assistant's name, mention it, or reply to one of its messages. The
  few previous messages are added as context.
- **Ambient** (only in channels enabled in /settings > Ambient, off by default): the bot reads the conversation and
  decides whether to step in. For timetable, assignment or room questions it answers briefly. For learning questions it
  offers help first, and answers only if the author reacts with ✅.
- /ambient lets each member opt out, or back in. The bot then ignores their messages in ambient mode.

Every message goes through a cascade, cheapest first, so most of them cost no tokens:

1. **Filters** (free): watched channel, opted-out authors, very short messages.
2. **Score** (free): keywords for questions, doubt, bot topics (courses, homework, rooms, exams) and requests for help.
   Only messages reaching minScore become candidates.
3. **Debounce**: the bot waits for debounceSeconds of silence (60 s max) so a burst of messages costs one check, with
   the full exchange as context.
4. **Classifier**: a single call to the fastest model, without reasoning, returning a short JSON verdict. The bot steps
   in only above confidence, outside the per-channel cooldownMinutes and under maxInterventionsPerHour.
5. **Answer**: the normal assistant pipeline, with the recent conversation as context.

Context stays small: the last contextMessages lines (each capped at 280 characters) plus a running summary. Once 30
lines are buffered, the oldest 20 are folded into the summary by the fast model. maxChecksPerHour and dailyTokenBudget
cap the total spend; when reached, the bot stays silent until the next hour or day. Decisions are logged with the
[ AMBIENT ] tag, and counters appear in the bot status.

| Setting                 | Default | Meaning                                        |
| ----------------------- | ------- | ---------------------------------------------- |
| enabled                 | false   | Master switch                                  |
| channels                | []      | Watched channel IDs                            |
| minScore                | 3       | Keyword score needed to reach the model        |
| confidence              | 0.75    | Classifier confidence needed to step in        |
| debounceSeconds         | 20      | Silence before checking                        |
| cooldownMinutes         | 5       | Minimum gap between interventions, per channel |
| maxChecksPerHour        | 20      | Classifier calls per hour                      |
| maxInterventionsPerHour | 4       | Interventions per hour                         |
| dailyTokenBudget        | 200000  | Tokens per day for checks and summaries        |
| contextMessages         | 8       | Recent lines sent as context                   |

Ambient mode needs the **Message Content** intent. Offers use reactions (GuildMessageReactions, no portal setting).
