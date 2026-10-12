const MAX_LINES = 200;

module.exports = async function handler(args, interaction, { assistant }) {
  const { tag } = args;
  if (typeof tag !== "string" || !tag.trim()) return { error: "A log tag is required." };

  const lines = assistant.logger.getLogLinesByTag(tag);
  return { tag, count: lines.length, lines: lines.slice(-MAX_LINES) };
};
