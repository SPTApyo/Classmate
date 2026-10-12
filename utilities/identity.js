const app = require("../package.json");
const { settings } = require("./config");

let client = null;

function setClient(discordClient) {
  client = discordClient;
}

const DEFAULT_NAME = "Atlas";

function botName() {
  return settings.get().assistantName?.trim() || DEFAULT_NAME;
}

function embedFooter() {
  const iconURL = settings.get().appearance?.embedFooterIconUrl || client?.user?.displayAvatarURL() || undefined;
  return { text: `${botName()}  |  Made by ${app.author}`, iconURL };
}

module.exports = { setClient, botName, embedFooter };
