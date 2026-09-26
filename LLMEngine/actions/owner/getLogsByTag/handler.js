const MAX_LINES = 200;

module.exports = async function handler(args, interaction, { llmClient }) {
  const { tag } = args;
  if (typeof tag !== "string" || !tag.trim()) return { error: "A log tag is required." };

  const lines = llmClient.logger.getLogLinesByTag(tag);
  return { tag, count: lines.length, lines: lines.slice(-MAX_LINES) };
};
