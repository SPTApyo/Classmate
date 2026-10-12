const { MessageFlags } = require("discord.js");
const { describeUserError } = require("../../../utilities/i18n");

const LLM_TIMEOUT_MS = 120000;

// Generation keeps running; the reply stops waiting.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms / 1000} seconds`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function handler(interaction, deps) {
  const {
    t,
    assistant,
    interacting,
    logger,
    permissions,
    checkRateLimit,
    downloadAttachment,
    smartChunk,
    SAFE_MENTIONS,
  } = deps;
  const isAdmin = permissions.isAdmin(interaction);
  const rateLimit = checkRateLimit(interaction.user.id, isAdmin);
  if (!rateLimit.allowed) {
    const seconds = Math.ceil(rateLimit.remainingMs / 1000);
    return interacting.replyToInteraction(interaction, t("common.rateLimited", { seconds }));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const text = interaction.options.getString("text");
    const attachment = interaction.options.getAttachment("file");
    const fileObj = attachment ? await downloadAttachment(attachment) : null;

    const response = await withTimeout(assistant.generateContent(text, interaction, "", fileObj), LLM_TIMEOUT_MS);
    const [first, ...rest] = smartChunk(response?.trim() ? response : t("chat.noAnswer"));

    await interaction.editReply({ content: first, allowedMentions: SAFE_MENTIONS });
    for (const chunk of rest) {
      await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral, allowedMentions: SAFE_MENTIONS });
    }
  } catch (err) {
    logger.logMessage(`[ ERROR ] /chat failed for ${interaction.user.username}`, err);
    const content = describeUserError(t, err) || t("chat.error", { message: err.message });
    await interaction.editReply({ content }).catch(() => {});
  }
}

module.exports = handler;
