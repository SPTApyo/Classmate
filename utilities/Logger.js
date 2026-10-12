const fs = require("fs");
const moment = require("moment");
const { config, settings } = require("./config");

const MAX_LOG_FILES = 15;
const DISCORD_FORUM_CHANNEL = 15;
const TAG_COLORS = {
  SUCCESS: "\x1b[92m",
  ERROR: "\x1b[91m",
  NOTICE: "\x1b[94m",
  AI: "\x1b[36m",
  STORE: "\x1b[35m",
  AMBIENT: "\x1b[33m",
};
const RESET = "\x1b[0m";

function colorize(line) {
  return line.replace(/\[ (\w+) \]/g, (match, tag) =>
    TAG_COLORS[tag] ? `[${TAG_COLORS[tag]} ${tag} ${RESET}]` : match,
  );
}

class Logger {
  constructor(client) {
    this.client = client;
    this.logDirectory = config.directories.logDirectory;
    this.logFileName = `${this.logDirectory}/log_${moment().format("YYYY-MM-DD_HH-mm-ss")}.txt`;
  }

  logMessage(message, error = null) {
    try {
      let line = `${moment().format("YYYY/MM/DD HH:mm:ss")} - > ${message}`;
      if (error) {
        line += ` : ${error.message || error}`;
        sendErrorToLogChannel(this.client, message, error);
      }

      console.log(colorize(line));

      // Sync write keeps log order across async handlers.
      fs.appendFileSync(this.logFileName, `${line}\n`);
    } catch (e) {
      console.error("[ ERROR ] Failed to write to the log file", e);
    }
  }

  manageLogFiles() {
    try {
      const byNewest = (a, b) =>
        fs.statSync(`${this.logDirectory}/${b}`).mtime - fs.statSync(`${this.logDirectory}/${a}`).mtime;
      const oldFiles = fs.readdirSync(this.logDirectory).sort(byNewest).slice(MAX_LOG_FILES);
      for (const file of oldFiles) {
        fs.unlinkSync(`${this.logDirectory}/${file}`);
      }
      if (oldFiles.length) this.logMessage(`[ NOTICE ] Deleted ${oldFiles.length} old log file(s)`);
    } catch (e) {
      this.logMessage("[ ERROR ] Failed to clean up log files", e);
    }
  }

  getLogLinesByTag(tag) {
    try {
      const safeTag = String(tag)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\[\\s*${safeTag}\\s*\\]`, "i");
      return fs
        .readFileSync(this.logFileName, "utf-8")
        .split("\n")
        .filter((line) => regex.test(line));
    } catch (e) {
      this.logMessage(`[ ERROR ] Failed to read log lines for tag [${tag}]`, e);
      return [];
    }
  }
}

async function sendErrorToLogChannel(client, message, error) {
  if (!client?.isReady?.()) return;
  try {
    const logChannel = await client.channels.fetch(settings.get().channels.log);
    const content = `:warning: **Error detected**: ${message}\n\`\`\`js\n${error.stack || error}\n\`\`\``.slice(
      0,
      2000,
    );
    if (logChannel?.type === DISCORD_FORUM_CHANNEL) {
      await logChannel.threads.create({
        name: `Error Report - ${moment().format("YYYY-MM-DD HH:mm:ss")}`,
        message: { content },
      });
    } else if (logChannel?.isTextBased()) {
      await logChannel.send({ content });
    }
  } catch (e) {
    console.error("[ ERROR ] Failed to send the error to the log channel", e);
  }
}

module.exports = Logger;
