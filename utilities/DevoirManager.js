const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { settings } = require("./config");
const Logger = require("./Logger");
const { fromRoot } = require("./paths");

const DATA_DIR = fromRoot("data", "devoirs");
const DATE_FORMAT = "DD-MM-YYYY";
// Group names end up in file paths.
const GROUP_NAME_REGEX = /^[A-Za-z0-9_-]{1,32}$/;
const FILE_PREFIX = "devoirs_";

const byDueDate = (a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT));

class DevoirManager {
  constructor(logger) {
    if (!(logger instanceof Logger)) {
      throw new Error("Logger must be an instance of Logger class");
    }
    this.logger = logger;
  }

  // Stable identity: ids change on regenerate.
  static keyOf(devoir) {
    return `${devoir.devoir}|${devoir.matiere}`.toLowerCase();
  }

  // Deadline in ms; date-only assignments end at midnight.
  static dueOf(devoir) {
    if (Number.isFinite(devoir.due)) return devoir.due;
    return moment(devoir.date, DATE_FORMAT).endOf("day").valueOf();
  }

  static isValidGroupName(group) {
    return typeof group === "string" && GROUP_NAME_REGEX.test(group);
  }

  getFilePath(group) {
    if (!DevoirManager.isValidGroupName(group)) {
      throw new Error(`Invalid group name: ${group}`);
    }
    return path.join(DATA_DIR, `${FILE_PREFIX}${group}.json`);
  }

  init() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    for (const task of settings.get().tasks) {
      const filePath = this.getFilePath(task.group);
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf-8");
    }
  }

  decodeHtmlEntities(text) {
    if (typeof text !== "string") return text;
    return text
      .replace(/&amp;|&amp\\;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\\\/g, "\\");
  }

  getAllGroups() {
    const groups = new Set(settings.get().tasks.map((task) => task.group));
    if (fs.existsSync(DATA_DIR)) {
      for (const file of fs.readdirSync(DATA_DIR)) {
        if (file.startsWith(FILE_PREFIX) && file.endsWith(".json")) {
          groups.add(file.slice(FILE_PREFIX.length, -".json".length));
        }
      }
    }
    return [...groups].filter(DevoirManager.isValidGroupName);
  }

  resolveGroup(group) {
    if (typeof group !== "string") return null;
    const wanted = group.trim().toUpperCase();
    return this.getAllGroups().find((g) => g.toUpperCase() === wanted) || null;
  }

  loadDevoirs(group) {
    const filePath = this.getFilePath(group);
    if (!fs.existsSync(filePath)) return [];
    const devoirs = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(devoirs) ? devoirs : [];
  }

  saveDevoirsForGroup(group, devoirs) {
    const filePath = this.getFilePath(group);
    try {
      fs.writeFileSync(filePath, JSON.stringify(devoirs, null, 2), "utf-8");
    } catch (error) {
      this.logger.logMessage(`[ ERROR ] Failed to save ${filePath}`, error);
    }
  }

  // Same title and subject updates the due date.
  addDevoir(devoir) {
    const devoirs = this.loadDevoirs(devoir.group);
    devoir.devoir = this.decodeHtmlEntities(devoir.devoir);
    devoir.matiere = this.decodeHtmlEntities(devoir.matiere);

    const existing = devoirs.find((d) => DevoirManager.keyOf(d) === DevoirManager.keyOf(devoir));
    if (existing) {
      const moved = existing.date !== devoir.date || (devoir.due !== undefined && existing.due !== devoir.due);
      if (moved) {
        existing.date = devoir.date;
        if (devoir.due !== undefined) existing.due = devoir.due;
        // New deadline: alerts must fire again.
        delete existing.alerted;
        this.saveDevoirsForGroup(devoir.group, devoirs);
      }
      return { devoir: existing, created: false };
    }

    const usedIds = new Set(devoirs.map((d) => d.id));
    let id = 0;
    while (usedIds.has(id)) id++;
    devoir.id = id;
    devoirs.push(devoir);
    this.saveDevoirsForGroup(devoir.group, devoirs);
    return { devoir, created: true };
  }

  updateDevoirs(group, mutator) {
    const devoirs = this.loadDevoirs(group);
    if (mutator(devoirs)) this.saveDevoirsForGroup(group, devoirs);
    return devoirs;
  }

  deleteDevoir({ group, id }) {
    const devoirs = this.loadDevoirs(group);
    const index = devoirs.findIndex((d) => d.id === Number(id));
    if (index === -1) return false;
    devoirs.splice(index, 1);
    this.saveDevoirsForGroup(group, devoirs);
    return true;
  }

  purgeGroups(groups = this.getAllGroups()) {
    groups.forEach((group) => this.saveDevoirsForGroup(group, []));
    return groups;
  }

  removeExpiredDevoirs() {
    const threshold = DevoirManager.expiryThreshold();
    for (const group of this.getAllGroups()) {
      const devoirs = this.loadDevoirs(group).filter((d) => moment(d.date, DATE_FORMAT).isSameOrAfter(threshold));
      this.saveDevoirsForGroup(group, devoirs);
    }
  }

  static expiryThreshold() {
    return moment().startOf("day").subtract(1, "day");
  }

  sortDevoirs() {
    for (const group of this.getAllGroups()) {
      this.saveDevoirsForGroup(group, this.loadDevoirs(group).sort(byDueDate));
    }
  }

  regenerateIds() {
    for (const group of this.getAllGroups()) {
      const devoirs = this.loadDevoirs(group);
      devoirs.forEach((devoir, index) => {
        devoir.id = index;
      });
      this.saveDevoirsForGroup(group, devoirs);
    }
  }

  getAllDevoirsGrouped() {
    const result = {};
    for (const group of this.getAllGroups()) {
      result[group] = this.loadDevoirs(group);
    }
    const total = Object.values(result).reduce((sum, devoirs) => sum + devoirs.length, 0);
    return total === 0 ? { message: "No assignment in any group." } : result;
  }
}

DevoirManager.DATE_FORMAT = DATE_FORMAT;
DevoirManager.byDueDate = byDueDate;

module.exports = DevoirManager;
