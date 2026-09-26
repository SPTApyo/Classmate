const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const { ADMIN_PERMISSION } = require("./permissions");
const { fromRoot } = require("./paths");

// Discord hides owner and admin commands from members.
const SCOPES = [
  { dir: "owner", defaultMemberPermissions: ADMIN_PERMISSION.toString() },
  { dir: "admin", defaultMemberPermissions: ADMIN_PERMISSION.toString() },
  { dir: "user", defaultMemberPermissions: null },
];

class CommandDeployer {
  constructor(logger, client) {
    this.logger = logger;
    this.client = client;
  }

  // Command name comes from its folder name.
  collectCommands() {
    const commands = [];
    for (const { dir, defaultMemberPermissions } of SCOPES) {
      const scopeDir = fromRoot("commands", dir);
      for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        const file = path.join(scopeDir, entry.name, "command.json");
        if (!entry.isDirectory() || !fs.existsSync(file)) continue;
        commands.push({
          ...JSON.parse(fs.readFileSync(file, "utf8")),
          name: entry.name,
          default_member_permissions: defaultMemberPermissions,
        });
      }
    }
    return commands;
  }

  async deploy() {
    const commands = this.collectCommands();
    try {
      await this.client.application.commands.set(commands, config.guildId);
      this.logger.logMessage(`[ SUCCESS ] Deployed ${commands.length} slash commands`);
    } catch (error) {
      this.logger.logMessage("[ ERROR ] Failed to deploy slash commands", error);
    }
  }
}

module.exports = CommandDeployer;
