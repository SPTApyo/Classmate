const app = require("../package.json");
const { config, settings } = require("./config");

let client = null;

function setClient(discordClient) {
  client = discordClient;
}

// Server nickname set by the deployer wins.
function botName() {
  const guild = client?.guilds?.cache?.get(config.guildId);
  return guild?.members?.me?.displayName || client?.user?.displayName || client?.user?.username || app.name;
}

function embedFooter() {
  const iconURL = settings.get().appearance?.embedFooterIconUrl || client?.user?.displayAvatarURL() || undefined;
  return { text: `${botName()}  |  Made by ${app.author}`, iconURL };
}

module.exports = { setClient, botName, embedFooter };
