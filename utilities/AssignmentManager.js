const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { settings } = require("./config");
const Logger = require("./Logger");
const { fromRoot } = require("./paths");
const { writeJsonAtomic } = require("./jsonFile");

const DATA_DIR = fromRoot("data", "assignments");
const DATE_FORMAT = "YYYY-MM-DD";
// Group names end up in file paths.
const GROUP_NAME_REGEX = /^[A-Za-z0-9_-]{1,32}$/;
const FILE_PREFIX = "assignments_";

const byDueDate = (a, b) => moment(a.date, DATE_FORMAT).diff(moment(b.date, DATE_FORMAT));

class AssignmentManager {
  constructor(logger) {
    if (!(logger instanceof Logger)) {
      throw new Error("Logger must be an instance of Logger class");
    }
    this.logger = logger;
  }

  // Stable identity: ids change on regenerate.
  static keyOf(assignment) {
    return `${assignment.title}|${assignment.subject}`.toLowerCase();
  }

  // Deadline in ms; date-only assignments end at midnight.
  static dueOf(assignment) {
    if (Number.isFinite(assignment.due)) return assignment.due;
    return moment(assignment.date, DATE_FORMAT).endOf("day").valueOf();
  }

  static isValidGroupName(group) {
    return typeof group === "string" && GROUP_NAME_REGEX.test(group);
  }

  getFilePath(group) {
    if (!AssignmentManager.isValidGroupName(group)) {
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
    return [...groups].filter(AssignmentManager.isValidGroupName);
  }

  resolveGroup(group) {
    if (typeof group !== "string") return null;
    const wanted = group.trim().toUpperCase();
    return this.getAllGroups().find((g) => g.toUpperCase() === wanted) || null;
  }

  loadAssignments(group) {
    const filePath = this.getFilePath(group);
    if (!fs.existsSync(filePath)) return [];
    const assignments = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(assignments) ? assignments : [];
  }

  saveAssignments(group, assignments) {
    const filePath = this.getFilePath(group);
    try {
      writeJsonAtomic(filePath, assignments);
    } catch (error) {
      this.logger.logMessage(`[ ERROR ] Failed to save ${filePath}`, error);
    }
  }

  // Same title and subject updates the due date.
  addAssignment(assignment) {
    const assignments = this.loadAssignments(assignment.group);
    assignment.title = this.decodeHtmlEntities(assignment.title);
    assignment.subject = this.decodeHtmlEntities(assignment.subject);

    const existing = assignments.find((d) => AssignmentManager.keyOf(d) === AssignmentManager.keyOf(assignment));
    if (existing) {
      const moved =
        existing.date !== assignment.date || (assignment.due !== undefined && existing.due !== assignment.due);
      if (moved) {
        existing.date = assignment.date;
        if (assignment.due !== undefined) existing.due = assignment.due;
        // New deadline: alerts must fire again.
        delete existing.alerted;
        this.saveAssignments(assignment.group, assignments);
      }
      return { assignment: existing, created: false };
    }

    const usedIds = new Set(assignments.map((d) => d.id));
    let id = 0;
    while (usedIds.has(id)) id++;
    assignment.id = id;
    assignments.push(assignment);
    this.saveAssignments(assignment.group, assignments);
    return { assignment, created: true };
  }

  updateAssignments(group, mutator) {
    const assignments = this.loadAssignments(group);
    if (mutator(assignments)) this.saveAssignments(group, assignments);
    return assignments;
  }

  deleteAssignment({ group, id }) {
    const assignments = this.loadAssignments(group);
    const index = assignments.findIndex((d) => d.id === Number(id));
    if (index === -1) return false;
    assignments.splice(index, 1);
    this.saveAssignments(group, assignments);
    return true;
  }

  purgeGroups(groups = this.getAllGroups()) {
    groups.forEach((group) => this.saveAssignments(group, []));
    return groups;
  }

  removeExpired() {
    const threshold = AssignmentManager.expiryThreshold();
    for (const group of this.getAllGroups()) {
      const assignments = this.loadAssignments(group).filter((d) =>
        moment(d.date, DATE_FORMAT).isSameOrAfter(threshold),
      );
      this.saveAssignments(group, assignments);
    }
  }

  static expiryThreshold() {
    return moment().startOf("day").subtract(1, "day");
  }

  sortAssignments() {
    for (const group of this.getAllGroups()) {
      this.saveAssignments(group, this.loadAssignments(group).sort(byDueDate));
    }
  }

  regenerateIds() {
    for (const group of this.getAllGroups()) {
      const assignments = this.loadAssignments(group);
      assignments.forEach((assignment, index) => {
        assignment.id = index;
      });
      this.saveAssignments(group, assignments);
    }
  }

  getAllByGroup() {
    const result = {};
    for (const group of this.getAllGroups()) {
      result[group] = this.loadAssignments(group);
    }
    const total = Object.values(result).reduce((sum, assignments) => sum + assignments.length, 0);
    return total === 0 ? { message: "No assignment in any group." } : result;
  }
}

AssignmentManager.DATE_FORMAT = DATE_FORMAT;
AssignmentManager.byDueDate = byDueDate;

module.exports = AssignmentManager;
