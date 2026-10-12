const fs = require("fs");
const moment = require("moment");
const ical = require("ical");

const AssignmentManager = require("./AssignmentManager");
const Health = require("./health");
const permissions = require("./permissions");
const { translator } = require("./i18n");
const { sendDM } = require("./dm");
const { fromRoot } = require("./paths");
const { writeJsonAtomic } = require("./jsonFile");

const STATE_PATH = fromRoot("data", "assignments", "notifier-state.json");
const TICK_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAILY_DIGEST_HOUR = 6;
const UNTIMED_ALERT_HOUR = 18;
const ICS_TIMEOUT_MS = 30000;
const EMBED_DESCRIPTION_LIMIT = 4096;
const MESSAGE_LIMIT = 2000;
const MAX_LISTED_CHANGES = 15;
const DIGEST_SECTIONS = ["assignments", "quizzes", "projects"];
// Moodle exports event titles in the site language.
const OPENS_MARKERS = ["s'ouvre", "opens"];
const CLOSES_MARKERS = ["se termine", "closes"];
const DAY_NUMBERS = { m: 1, tu: 2, w: 3, th: 4, f: 5, sa: 6, su: 7 };
const NO_MENTIONS = { parse: [] };

const DEFAULTS = {
  ownerAlerts: true,
  newAssignments: true,
  timetableChanges: true,
  deadlineHours: [24, 3],
  eveningBriefHour: 19,
};

const isTestMode = () => process.env.PROCESS_TEST_MODE === "1";
const unix = (ms) => Math.floor(ms / 1000);
const isTimed = (assignment) => Number.isFinite(assignment.due);
const hasMarker = (title, markers) => markers.some((marker) => title.toLowerCase().includes(marker));
const sameGroup = (a, b) => String(a || "").toUpperCase() === String(b || "").toUpperCase();

// Moodle noise: DEADLINE, week numbers, times.
function cleanEventTitle(summary) {
  return summary.replace(/(DEADLINE.*|WEE?k\s*\d+.*|\d{1,2}(st|nd|rd|th)?\s*\w+\s*\d{2}:\d{2}.*)/gi, "").trim();
}

function courseStart(course) {
  return moment()
    .isoWeekYear(course.date.year)
    .isoWeek(course.date.week)
    .isoWeekday(DAY_NUMBERS[course.date.day] || 1)
    .startOf("day")
    .add(course.start_time, "minutes")
    .valueOf();
}

const summarizeCourse = (course) => ({
  name: course.course?.name || course.course?.abbrev || "?",
  type: course.course?.type || "",
  room: course.room || "?",
  start: courseStart(course),
});

// Only future slots matter to students.
function diffTimetable(previous, next, now) {
  const changes = [];
  for (const [id, old] of Object.entries(previous)) {
    const current = next[id];
    if (!current) {
      if (old.start > now) changes.push({ kind: "cancelled", course: old });
    } else if (current.start > now && current.start !== old.start) {
      changes.push({ kind: "moved", course: current, from: old.start });
    } else if (current.start > now && current.room !== old.room) {
      changes.push({ kind: "room", course: current, from: old.room });
    }
  }
  for (const [id, course] of Object.entries(next)) {
    if (!previous[id] && course.start > now) changes.push({ kind: "added", course });
  }
  return changes.sort((a, b) => a.course.start - b.course.start);
}

function packLines(header, lines, limit = MESSAGE_LIMIT) {
  const messages = [];
  let current = header;
  for (const line of lines) {
    if ((current + "\n" + line).length > limit) {
      messages.push(current);
      current = line;
    } else {
      current += "\n" + line;
    }
  }
  messages.push(current);
  return messages;
}

class Notifier {
  constructor({
    client,
    logger,
    settings,
    assignmentManager,
    assistantStore,
    timetableApi,
    interacting,
    now = Date.now,
  }) {
    Object.assign(this, {
      client,
      logger,
      settings,
      assignmentManager,
      assistantStore,
      timetableApi,
      interacting,
      now,
    });
    this.state = this.loadState();
    this.running = new Set();
    this.lastRun = {};
    this.health = new Health({ logger, notify: (event) => this.onHealthChange(event) });
  }

  options() {
    return { ...DEFAULTS, ...(this.settings.get().notifications || {}) };
  }

  loadState() {
    const empty = { digest: {}, synced: [], timetable: {} };
    try {
      return { ...empty, ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
    } catch {
      return empty;
    }
  }

  saveState() {
    try {
      writeJsonAtomic(STATE_PATH, this.state);
    } catch (error) {
      this.logger.logMessage("[ ERROR ] Failed to save the notifier state", error);
    }
  }

  start({ onDaily } = {}) {
    this.onDaily = onDaily;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  async runJob(name, job) {
    if (this.running.has(name)) return;
    this.running.add(name);
    try {
      await job();
    } catch (error) {
      this.logger.logMessage(`[ ERROR ] Scheduled job ${name} failed`, error);
    } finally {
      this.running.delete(name);
    }
  }

  async tick() {
    const now = moment(this.now());
    const today = now.format("YYYY-MM-DD");

    if (!this.lastRun.hourly || now.valueOf() - this.lastRun.hourly >= HOUR_MS) {
      this.lastRun.hourly = now.valueOf();
      await this.runJob("hourly", async () => {
        await this.syncAll();
        await this.checkTimetables();
      });
    }
    await this.runJob("deadlines", () => this.checkDeadlines());

    // Boot always runs it once, even before 6:00.
    if (this.lastRun.daily !== today && (now.hour() >= DAILY_DIGEST_HOUR || !this.lastRun.daily)) {
      this.lastRun.daily = now.hour() >= DAILY_DIGEST_HOUR ? today : "boot";
      await this.runJob("daily", () => this.runDaily());
    }

    const briefHour = this.options().eveningBriefHour;
    if (briefHour !== null && now.hour() === briefHour && this.lastRun.brief !== today) {
      this.lastRun.brief = today;
      await this.runJob("brief", () => this.sendBriefs());
    }
  }

  async runDaily() {
    this.assignmentManager.removeExpired();
    this.assignmentManager.sortAssignments();
    await this.sendDigests();
    await this.onDaily?.();
  }

  async checkAllGroups() {
    await this.syncAll();
    await this.sendDigests();
  }

  async channelFor(task, kind) {
    const { channels } = this.settings.get();
    let channelId = task.reminderChannelId;
    if (isTestMode()) channelId = channels.test;
    else if (kind === "announce" && channels.announcements) channelId = channels.announcements;
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error(`Channel ${channelId} for group ${task.group} is unavailable`);
    return channel;
  }

  // Test mode never pings real roles.
  mentionFor(task) {
    if (isTestMode() || !task.roleId) return { prefix: "", allowedMentions: NO_MENTIONS };
    return { prefix: `<@&${task.roleId}>\n`, allowedMentions: { parse: [], roles: [task.roleId] } };
  }

  async post(task, kind, { header, lines, ping = false }) {
    const channel = await this.channelFor(task, kind);
    const mention = ping ? this.mentionFor(task) : { prefix: "", allowedMentions: NO_MENTIONS };
    const messages = packLines(mention.prefix + header, lines);
    for (const [index, content] of messages.entries()) {
      const allowedMentions = index === 0 ? mention.allowedMentions : NO_MENTIONS;
      await channel.send({ content, allowedMentions });
    }
  }

  async onHealthChange({ key, down, count, error }) {
    if (!this.options().ownerAlerts) return;
    const t = translator();
    const content = down
      ? t("notifications.health.down", { key, count, error: String(error?.message || error).slice(0, 300) })
      : t("notifications.health.up", { key });
    await this.alertOwners(content);
  }

  async alertOwners(content) {
    let delivered = 0;
    for (const ownerId of permissions.getOwnerIds()) {
      const result = await sendDM(this.client, ownerId, { content, allowedMentions: NO_MENTIONS });
      if (result.ok) delivered++;
      else this.logger.logMessage(`[ NOTICE ] Owner ${ownerId} does not accept DMs`);
    }
    if (delivered > 0) return;
    const logChannel = await this.client.channels.fetch(this.settings.get().channels.log).catch(() => null);
    await logChannel?.send({ content, allowedMentions: NO_MENTIONS }).catch(() => {});
  }

  async testOwnerDMs() {
    const content = translator()("notifications.ownerTest");
    let delivered = 0;
    for (const ownerId of permissions.getOwnerIds()) {
      if ((await sendDM(this.client, ownerId, { content })).ok) delivered++;
    }
    return delivered;
  }

  async fetchCalendar(task) {
    const response = await fetch(task.icsUrl, { signal: AbortSignal.timeout(ICS_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`ICS download failed with status ${response.status}`);
    const text = await response.text();
    // Expired tokens return a login page.
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("ICS response is not a calendar (expired token?)");
    return Object.values(ical.parseICS(text));
  }

  async syncGroup(task) {
    const events = await this.fetchCalendar(task);
    const threshold = AssignmentManager.expiryThreshold();
    const created = [];
    for (const event of events) {
      if (event.type !== "VEVENT" || !event.summary || !event.end) continue;
      if (moment(event.end).isBefore(threshold)) continue;
      const title = cleanEventTitle(event.summary);
      // Moodle "opens" events are not deadlines.
      if (!title || hasMarker(title, OPENS_MARKERS)) continue;

      const end = moment(event.end);
      const result = this.assignmentManager.addAssignment({
        group: task.group,
        title,
        // Only Moodle fills categories with the course.
        subject: [event.categories].flat().filter(Boolean).join(", ") || task.group,
        date: end.format(AssignmentManager.DATE_FORMAT),
        due: end.valueOf(),
        addedBy: "Calendar",
      });
      if (result.created) created.push(result.assignment);
    }
    return created;
  }

  async syncAll() {
    for (const task of this.settings.get().tasks) {
      const key = `Calendar ${task.group}`;
      let created;
      try {
        created = await this.syncGroup(task);
        await this.health.ok(key);
      } catch (error) {
        await this.health.fail(key, error);
        continue;
      }
      this.logger.logMessage(`[ SUCCESS ] Calendar synced for group ${task.group} (${created.length} new)`);

      // First sync fills the list silently.
      if (!this.state.synced.includes(task.group)) {
        this.state.synced.push(task.group);
        this.saveState();
        continue;
      }
      const upcoming = created.filter((assignment) => AssignmentManager.dueOf(assignment) > this.now());
      if (this.options().newAssignments && upcoming.length > 0) {
        await this.announceNew(task, upcoming).catch((error) =>
          this.logger.logMessage(`[ ERROR ] Failed to announce new assignments for ${task.group}`, error),
        );
      }
    }
  }

  when(assignment) {
    if (!isTimed(assignment)) return assignment.date;
    return `<t:${unix(assignment.due)}:f> (<t:${unix(assignment.due)}:R>)`;
  }

  itemLine(t, assignment) {
    return t("notifications.item", {
      title: assignment.title,
      subject: assignment.subject,
      when: this.when(assignment),
    });
  }

  async announceNew(task, assignments) {
    const t = translator();
    await this.post(task, "announce", {
      header: t("notifications.newAssignments", { group: task.group }),
      lines: assignments.map((assignment) => this.itemLine(t, assignment)),
    });
  }

  // Date-only assignments: evening before, never hours.
  alertTime(assignment, hours) {
    if (isTimed(assignment)) return assignment.due - hours * HOUR_MS;
    if (hours < 24) return null;
    return moment(assignment.date, AssignmentManager.DATE_FORMAT)
      .subtract(Math.round(hours / 24), "days")
      .hour(UNTIMED_ALERT_HOUR)
      .startOf("hour")
      .valueOf();
  }

  // After downtime, several offsets collapse into one alert.
  collectDueAlerts(group) {
    const hours = this.options().deadlineHours;
    const now = this.now();
    const due = [];
    this.assignmentManager.updateAssignments(group, (assignments) => {
      for (const assignment of assignments) {
        if (AssignmentManager.dueOf(assignment) <= now) continue;
        const alerted = assignment.alerted || [];
        const reached = hours.filter((h) => {
          const at = this.alertTime(assignment, h);
          return !alerted.includes(h) && at !== null && now >= at;
        });
        if (reached.length === 0) continue;
        assignment.alerted = [...alerted, ...reached];
        due.push(assignment);
      }
      return due.length > 0;
    });
    return due;
  }

  async checkDeadlines() {
    if (this.options().deadlineHours.length === 0) return;
    for (const task of this.settings.get().tasks) {
      const due = this.collectDueAlerts(task.group);
      if (due.length === 0) continue;
      const t = translator();
      try {
        await this.post(task, "announce", {
          header: t("notifications.deadline", { group: task.group }),
          lines: due.map((assignment) => this.itemLine(t, assignment)),
          ping: true,
        });
        this.logger.logMessage(`[ SUCCESS ] Sent ${due.length} deadline alert(s) for group ${task.group}`);
      } catch (error) {
        this.logger.logMessage(`[ ERROR ] Failed to send deadline alerts for ${task.group}`, error);
      }
      await this.sendReminderDMs(task, due);
    }
  }

  // Closed DMs turn the subscription off.
  async sendReminderDMs(task, assignments) {
    const t = translator();
    const subscribers = this.assistantStore
      .getUsers()
      .filter((user) => user.dmReminders && sameGroup(user.group, task.group));
    for (const user of subscribers) {
      const done = new Set(user.done || []);
      const pending = assignments.filter((assignment) => !done.has(AssignmentManager.keyOf(assignment)));
      if (pending.length === 0) continue;
      const [content] = packLines(
        t("notifications.dm.deadline", { group: task.group }),
        pending.map((assignment) => this.itemLine(t, assignment)),
      );
      const result = await sendDM(this.client, user.userId, { content, allowedMentions: NO_MENTIONS });
      if (result.ok) continue;
      if (result.closed) {
        this.assistantStore.setUserField(user.userId, "dmReminders", false);
        this.logger.logMessage(`[ NOTICE ] DM reminders disabled for ${user.userId}: DMs are closed`);
      } else {
        this.logger.logMessage(`[ ERROR ] Failed to DM reminder to ${user.userId}`, result.error);
      }
    }
  }

  isProject(assignment) {
    const subject = assignment.subject.toLowerCase();
    return (this.settings.get().projectSubjects || []).some((name) => subject.includes(name.toLowerCase()));
  }

  formatRemaining(t, daysRemaining) {
    if (daysRemaining === 0) return t("reminders.today");
    const count = Math.abs(daysRemaining);
    const duration = count === 1 ? t("reminders.dayOne") : t("reminders.dayMany", { count });
    return daysRemaining > 0 ? duration : t("reminders.late", { duration });
  }

  buildSections(t, group) {
    const today = moment(this.now()).startOf("day");
    const sections = { assignments: "", quizzes: "", projects: "" };
    for (const assignment of this.assignmentManager.loadAssignments(group)) {
      const daysRemaining = moment(assignment.date, AssignmentManager.DATE_FORMAT).startOf("day").diff(today, "days");
      const item =
        t("reminders.item", {
          title: assignment.title,
          subject: assignment.subject,
          date: isTimed(assignment) ? `<t:${unix(assignment.due)}:f>` : assignment.date,
          remaining: isTimed(assignment) ? `<t:${unix(assignment.due)}:R>` : this.formatRemaining(t, daysRemaining),
        }) + "\n\n";
      const withinMonth = daysRemaining <= 31 && daysRemaining >= -2;
      if (hasMarker(assignment.title, CLOSES_MARKERS) && withinMonth) sections.quizzes += item;
      else if (this.isProject(assignment) && withinMonth) sections.projects += item;
      else if (daysRemaining <= 7 && daysRemaining >= -2) sections.assignments += item;
    }
    return sections;
  }

  // Deletes only the bot's own messages.
  async clearBotMessages(channel) {
    try {
      const fetched = await channel.messages.fetch({ limit: 50 });
      const own = fetched.filter((msg) => msg.author.id === this.client.user.id);
      // Bulk delete skips messages older than 14 days.
      if (own.size > 0) await channel.bulkDelete(own, true);
    } catch (error) {
      this.logger.logMessage(`[ ERROR ] Failed to clear old reminders in #${channel.name}`, error);
    }
  }

  async sendDigests() {
    for (const task of this.settings.get().tasks) {
      try {
        await this.sendDigest(task);
      } catch (error) {
        this.logger.logMessage(`[ ERROR ] Failed to send reminders for group ${task.group}`, error);
      }
    }
  }

  async sendDigest(task) {
    const { group } = task;
    const { appearance } = this.settings.get();
    const channel = await this.channelFor(task, "digest");
    const t = translator();
    const sections = this.buildSections(t, group);
    const colors = {
      assignments: appearance.embedAssignmentsColor,
      quizzes: appearance.embedQuizzesColor,
      projects: appearance.embedProjectsColor,
    };
    const embedFor = (key) => {
      const content = sections[key];
      const description =
        content.length > EMBED_DESCRIPTION_LIMIT ? content.slice(0, EMBED_DESCRIPTION_LIMIT - 2) + "\n…" : content;
      return this.interacting.createEmbed(t(`reminders.${key}`, { group }), description, colors[key]);
    };

    if (isTestMode()) {
      for (const key of DIGEST_SECTIONS.filter((k) => sections[k])) await channel.send({ embeds: [embedFor(key)] });
      return;
    }

    let stored = this.state.digest[group];
    if (!stored || stored.channelId !== channel.id) {
      await this.clearBotMessages(channel);
      stored = { channelId: channel.id };
    }
    for (const key of DIGEST_SECTIONS) {
      const existing = stored[key] ? await channel.messages.fetch(stored[key]).catch(() => null) : null;
      if (!sections[key]) {
        await existing?.delete().catch(() => {});
        delete stored[key];
      } else if (existing) {
        await existing.edit({ embeds: [embedFor(key)] });
      } else {
        stored[key] = (await channel.send({ embeds: [embedFor(key)] })).id;
      }
    }
    this.state.digest[group] = stored;
    this.saveState();
    this.logger.logMessage(`[ SUCCESS ] Reminders updated for group ${group}`);
  }

  planningTarget(task) {
    const dept = this.settings.get().planning?.defaultDept;
    if (!task.level || !dept) return null;
    return { dept, level: task.level, group: task.group };
  }

  async fetchCourses(target, date) {
    const week = { year: date.isoWeekYear(), week: date.isoWeek() };
    try {
      const courses = await this.timetableApi.getCourses({ ...target, ...week });
      await this.health.ok("Planning API");
      return { week, courses };
    } catch (error) {
      await this.health.fail("Planning API", error);
      return null;
    }
  }

  async checkTimetables() {
    if (!this.options().timetableChanges) return;
    const now = moment(this.now());
    for (const task of this.settings.get().tasks) {
      const target = this.planningTarget(task);
      if (!target) continue;
      const changes = [];
      const watched = new Set();
      for (const date of [now.clone(), now.clone().add(1, "week")]) {
        const result = await this.fetchCourses(target, date);
        if (!result) return;
        const key = `${task.group}:${result.week.year}-${result.week.week}`;
        watched.add(key);
        const previous = this.state.timetable[key];
        const next = Object.fromEntries(result.courses.map((course) => [course.id, summarizeCourse(course)]));
        // Empty week after a full one: API glitch.
        if (previous && Object.keys(previous).length > 0 && result.courses.length === 0) continue;
        if (previous) changes.push(...diffTimetable(previous, next, this.now()));
        this.state.timetable[key] = next;
      }
      for (const key of Object.keys(this.state.timetable)) {
        if (key.startsWith(`${task.group}:`) && !watched.has(key)) delete this.state.timetable[key];
      }
      this.saveState();
      if (changes.length > 0) await this.announceChanges(task, changes);
    }
  }

  changeLine(t, change) {
    const { course } = change;
    const params = { name: course.name, type: course.type, room: course.room, at: `<t:${unix(course.start)}:f>` };
    if (change.kind === "moved") params.from = `<t:${unix(change.from)}:f>`;
    if (change.kind === "room") params.from = change.from;
    return t(`notifications.timetable.${change.kind}`, params);
  }

  async announceChanges(task, changes) {
    const t = translator();
    const lines =
      changes.length > MAX_LISTED_CHANGES
        ? [t("notifications.timetable.many", { count: changes.length })]
        : changes.map((change) => this.changeLine(t, change));
    try {
      await this.post(task, "announce", {
        header: t("notifications.timetable.title", { group: task.group }),
        lines,
        ping: true,
      });
      this.logger.logMessage(`[ SUCCESS ] Announced ${changes.length} timetable change(s) for ${task.group}`);
    } catch (error) {
      this.logger.logMessage(`[ ERROR ] Failed to announce timetable changes for ${task.group}`, error);
    }
  }

  async sendBriefs() {
    const tomorrow = moment(this.now()).add(1, "day");
    for (const task of this.settings.get().tasks) {
      const target = this.planningTarget(task);
      if (!target) continue;
      const result = await this.fetchCourses(target, tomorrow);
      if (!result) return;
      const day = result.courses
        .filter((course) => DAY_NUMBERS[course.date.day] === tomorrow.isoWeekday())
        .sort((a, b) => a.start_time - b.start_time);
      if (day.length === 0) continue;

      const first = summarizeCourse(day[0]);
      const last = day[day.length - 1];
      const t = translator();
      try {
        await this.post(task, "announce", {
          header: t("notifications.brief", {
            group: task.group,
            name: first.name,
            room: first.room,
            start: `<t:${unix(first.start)}:t>`,
            end: `<t:${unix(courseStart(last) + last.duration * 60000)}:t>`,
            count: day.length,
          }),
          lines: [],
        });
      } catch (error) {
        this.logger.logMessage(`[ ERROR ] Failed to send the evening brief for ${task.group}`, error);
      }
    }
  }
}

Notifier.DEFAULTS = DEFAULTS;
Notifier.diffTimetable = diffTimetable;
Notifier.packLines = packLines;

module.exports = Notifier;
