const fs = require("fs");
const { fromRoot } = require("../../utilities/paths");

const LLM_CONFIG_PATH = fromRoot("data", "config", "llmData.json");
// Template shipped in the Docker image.
const LLM_CONFIG_DEFAULT_PATH = fromRoot("defaults", "llmData.json");
const USERS_PATH = fromRoot("data", "user_data", "llmUsers.json");
const DIRECTIVES_PATH = fromRoot("data", "user_data", "llmDirectives.json");
const PROFILE_FIELDS = ["pseudo", "alias", "group", "dept", "train_prog"];

// Shared cache: every write goes through saveUsers().
let usersCache = null;

const toUpper = (value) => (typeof value === "string" ? value.trim().toUpperCase() : "");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

class LLMDataManager {
  constructor(logger = null) {
    this.logger = logger;
  }

  log(message) {
    this.logger?.logMessage(message);
  }

  // Read on each call: edits apply without restart.
  loadData() {
    try {
      if (!fs.existsSync(LLM_CONFIG_PATH) && fs.existsSync(LLM_CONFIG_DEFAULT_PATH)) {
        fs.copyFileSync(LLM_CONFIG_DEFAULT_PATH, LLM_CONFIG_PATH);
        this.log("[ LLMDATA ] [ NOTICE ] Created llmData.json from the default template");
      }
      return readJson(LLM_CONFIG_PATH);
    } catch (e) {
      this.log("[ LLMDATA ] [ ERROR ] Cannot read llmData.json, creating an empty one");
      const data = { systemInstruction: "" };
      this.saveData(data);
      return data;
    }
  }

  saveData(data) {
    try {
      fs.writeFileSync(LLM_CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      this.log(`[ LLMDATA ] [ ERROR ] Failed to save llmData.json: ${e.message}`);
    }
  }

  getAllData() {
    return this.loadData();
  }

  loadUsers() {
    if (usersCache) return usersCache;
    try {
      usersCache = readJson(USERS_PATH).users || [];
    } catch (e) {
      this.log("[ LLMDATA ] [ ERROR ] Cannot read llmUsers.json, creating an empty one");
      this.saveUsers([]);
    }
    return usersCache;
  }

  saveUsers(users) {
    usersCache = users;
    try {
      fs.writeFileSync(USERS_PATH, JSON.stringify({ users }, null, 2), "utf-8");
    } catch (e) {
      this.log(`[ LLMDATA ] [ ERROR ] Failed to save llmUsers.json: ${e.message}`);
    }
  }

  getUserById(userId) {
    return this.loadUsers().find((u) => u.userId === userId) || null;
  }

  getUserByPseudoOrAlias(value) {
    if (typeof value !== "string") return null;
    const wanted = value.toLowerCase();
    return (
      this.loadUsers().find((u) => u.pseudo?.toLowerCase() === wanted || u.alias?.toLowerCase() === wanted) || null
    );
  }

  // Empty fields are ignored; codes stored uppercase.
  upsertUser({ userId, pseudo, group, alias, dept, train_prog, silent = false }) {
    if (!userId || typeof userId !== "string") {
      throw new Error("Missing or invalid userId.");
    }
    const fields = {
      pseudo: typeof pseudo === "string" ? pseudo : "",
      alias: typeof alias === "string" ? alias.trim() : "",
      group: toUpper(group),
      dept: toUpper(dept),
      train_prog: toUpper(train_prog),
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
      if (!silent) this.log(`[ LLMDATA ] [ SUCCESS ] Saved user ${user.pseudo} (${userId})`);
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
    try {
      const { directives } = readJson(DIRECTIVES_PATH);
      return Array.isArray(directives) ? directives : [];
    } catch (e) {
      return [];
    }
  }

  saveDirectivesToFile(directives) {
    try {
      fs.writeFileSync(DIRECTIVES_PATH, JSON.stringify({ directives }, null, 2), "utf-8");
      return true;
    } catch (e) {
      this.log(`[ LLMDATA ] [ ERROR ] Failed to save directives: ${e.message}`);
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

module.exports = LLMDataManager;
