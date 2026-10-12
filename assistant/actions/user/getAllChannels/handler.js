module.exports = async function handler(args, interaction, { assistant }) {
  return { channels: await assistant.getAllChannelsInfo() };
};
