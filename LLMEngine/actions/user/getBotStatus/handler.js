const os = require("os");

const toMB = (bytes) => Math.round(bytes / 1024 / 1024);

module.exports = async function handler(args, interaction, { llmClient, config }) {
  const uptimeSec = Math.round(process.uptime());
  const guild = llmClient.client?.guilds?.cache?.get(config.guildId);
  const devoirManager = llmClient.devoirManager;
  const groups = devoirManager.getAllGroups();

  return {
    ram: `${toMB(os.totalmem() - os.freemem())}MB / ${toMB(os.totalmem())}MB`,
    processMemory: `${toMB(process.memoryUsage().rss)}MB`,
    uptime: `${Math.floor(uptimeSec / 3600)}h ${Math.floor(uptimeSec / 60) % 60}m ${uptimeSec % 60}s`,
    startTime: new Date(Date.now() - uptimeSec * 1000).toISOString(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    loadavg: os.loadavg(),
    nodeVersion: process.version,
    botVersion: llmClient.app.Appversion || "unknown",
    discord: {
      memberCount: guild?.memberCount || 0,
      channelCount: guild?.channels.cache.size || 0,
      roleCount: guild?.roles.cache.size || 0,
    },
    devoirs: {
      groupCount: groups.length,
      devoirCount: groups.reduce((sum, group) => sum + devoirManager.loadDevoirs(group).length, 0),
    },
    chatHistoryLength: llmClient.chatHistory.length,
    models: llmClient.getModelStats(),
    ambient: llmClient.ambient?.getStats() || null,
    errorLogCount: llmClient.logger.getLogLinesByTag("ERROR").length,
    time: new Date().toISOString(),
  };
};
