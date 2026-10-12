const fs = require("fs");
const { fromRoot } = require("../utilities/paths");
const { readJson, writeJsonAtomic, readJsonOrSetAside } = require("../utilities/jsonFile");

const PERSONA_PATH = fromRoot("data", "config", "persona.json");
// Template shipped in the Docker image.
const PERSONA_DEFAULT_PATH = fromRoot("defaults", "persona.json");
const USERS_PATH = fromRoot("data", "user_data", "users.json");
const DIRECTIVES_PATH = fromRoot("data", "user_data", "directives.json");
const PROFILE_FIELDS = ["username", "alias", "group", "dept", "level"];

// Shared cache: every write goes through saveUsers().
let usersCache = null;

const toUpper = (value) => (typeof value === "string" ? value.trim().toUpperCase() : "");

class AssistantStore {
  constructor(logger = null) {
    this.logger = logger;
  }

  log(message) {
    this.logger?.logMessage(message);
  }

  // Re-read per call; syntax errors throw, file kept.
  loadData() {
    if (!fs.existsSync(PERSONA_PATH)) {
      if (!fs.existsSync(PERSONA_DEFAULT_PATH)) return { systemInstruction: "" };
      fs.copyFileSync(PERSONA_DEFAULT_PATH, PERSONA_PATH);
      this.log("[ STORE ] [ NOTICE ] Created persona.json from the default template");
    }
    return readJson(PERSONA_PATH);
  }

  getAllData() {
    return this.loadData();
  }

  loadUsers() {
    if (usersCache) return usersCache;
    usersCache = readJsonOrSetAside(USERS_PATH, {}, (m) => this.log(`[ STORE ] ${m}`)).users || [];
    return usersCache;
  }

  saveUsers(users) {
    usersCache = users;
    try {
      writeJsonAtomic(USERS_PATH, { users });
    } catch (e) {
      this.log(`[ STORE ] [ ERROR ] Failed to save users.json: ${e.message}`);
    }
  }

  getUserById(userId) {
    return this.loadUsers().find((u) => u.userId === userId) || null;
  }

  getUserByNameOrAlias(value) {
    if (typeof value !== "string") return null;
    const wanted = value.toLowerCase();
    return (
      this.loadUsers().find((u) => u.username?.toLowerCase() === wanted || u.alias?.toLowerCase() === wanted) || null
    );
  }

  // Empty fields are ignored; codes stored uppercase.
  upsertUser({ userId, username, group, alias, dept, level, silent = false }) {
    if (!userId || typeof userId !== "string") {
      throw new Error("Missing or invalid userId.");
    }
    const fields = {
      username: typeof username === "string" ? username : "",
      alias: typeof alias === "string" ? alias.trim() : "",
      group: toUpper(group),
      dept: toUpper(dept),
      level: toUpper(level),
    };

    const users = this.loadUsers();
    let user = users.find((u) => u.userId === userId);
    let updated = false;

    if (!user) {
      user = { userId, ...fields };
      users.push(user);
      updated = true;
    } else {
      for (const key of PROFILE_FIELDS) {
        if (fields[key] !== "" && user[key] !== fields[key]) {
          user[key] = fields[key];
          updated = true;
        }
      }
    }

    if (updated) {
      this.saveUsers(users);
      if (!silent) this.log(`[ STORE ] [ SUCCESS ] Saved user ${user.username} (${userId})`);
    }
    return user;
  }

  getUsers() {
    return this.loadUsers();
  }

  setUserField(userId, field, value) {
    const users = this.loadUsers();
    let user = users.find((u) => u.userId === userId);
    if (!user) {
      user = { userId };
      users.push(user);
    }
    user[field] = value;
    this.saveUsers(users);
    return value;
  }

  setAmbientOptOut(userId, optOut) {
    return this.setUserField(userId, "ambientOptOut", optOut);
  }

  isAmbientOptOut(userId) {
    return !!this.getUserById(userId)?.ambientOptOut;
  }

  loadDirectivesFromFile() {
    const { directives } = readJsonOrSetAside(DIRECTIVES_PATH, {}, (m) => this.log(`[ STORE ] ${m}`));
    return Array.isArray(directives) ? directives : [];
  }

  saveDirectivesToFile(directives) {
    try {
      writeJsonAtomic(DIRECTIVES_PATH, { directives });
      return true;
    } catch (e) {
      this.log(`[ STORE ] [ ERROR ] Failed to save directives: ${e.message}`);
      return false;
    }
  }

  addDirective(directive) {
    if (!directive) return false;
    return this.saveDirectivesToFile([...this.loadDirectivesFromFile(), directive]);
  }

  removeDirective(index) {
    const directives = this.loadDirectivesFromFile();
    const existed = Number.isInteger(index) && index >= 0 && index < directives.length;
    if (!existed) return { success: false, existed };
    directives.splice(index, 1);
    return { success: this.saveDirectivesToFile(directives), existed };
  }
}

module.exports = AssistantStore;
