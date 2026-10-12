const os = require("os");

const toMB = (bytes) => Math.round(bytes / 1024 / 1024);

module.exports = async function handler(args, interaction, { assistant, config }) {
  const uptimeSec = Math.round(process.uptime());
  const guild = assistant.client?.guilds?.cache?.get(config.guildId);
  const assignmentManager = assistant.assignmentManager;
  const groups = assignmentManager.getAllGroups();

  return {
    ram: `${toMB(os.totalmem() - os.freemem())}MB / ${toMB(os.totalmem())}MB`,
    processMemory: `${toMB(process.memoryUsage().rss)}MB`,
    uptime: `${Math.floor(uptimeSec / 3600)}h ${Math.floor(uptimeSec / 60) % 60}m ${uptimeSec % 60}s`,
    startTime: new Date(Date.now() - uptimeSec * 1000).toISOString(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    loadavg: os.loadavg(),
    nodeVersion: process.version,
    botVersion: assistant.app.version,
    discord: {
      memberCount: guild?.memberCount || 0,
      channelCount: guild?.channels.cache.size || 0,
      roleCount: guild?.roles.cache.size || 0,
    },
    assignments: {
      groupCount: groups.length,
      assignmentCount: groups.reduce((sum, group) => sum + assignmentManager.loadAssignments(group).length, 0),
    },
    chatHistoryLength: assistant.chatHistory.length,
    models: assistant.getModelStats(),
    ambient: assistant.ambient?.getStats() || null,
    errorLogCount: assistant.logger.getLogLinesByTag("ERROR").length,
    time: new Date().toISOString(),
  };
};
