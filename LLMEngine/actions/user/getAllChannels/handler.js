module.exports = async function handler(args, interaction, { llmClient }) {
  return { channels: await llmClient.getAllChannelsInfo() };
};
