// Data holds tokens: owner-only files and folders.
process.umask(0o077);

const { Client, GatewayIntentBits, Events } = require("discord.js");
const fs = require("fs");
const axios = require("axios");

const { fromRoot } = require("./utilities/paths");
const moduleRegistry = require("./utilities/moduleRegistry");

// Bad data must fail with one readable line.
function loadConfiguration() {
  try {
    const migrated = require("./utilities/migrateLegacyData").migrateLegacyData();
    const fromEnv = require("./utilities/envOverrides").applyEnvOverrides();
    return { migrated, fromEnv, ...require("./utilities/config") };
  } catch (error) {
    console.error(`[ ERROR ] ${error.message}`);
    process.exit(1);
  }
}

require("dotenv").config({ path: fromRoot("data", "keys", ".env"), quiet: true });
const { migrated, fromEnv, config, settings } = loadConfiguration();
const permissions = require("./utilities/permissions");
const identity = require("./utilities/identity");
const app = require("./package.json");
const AssignmentManager = require("./utilities/AssignmentManager");
const Logger = require("./utilities/Logger");
const Interacting = require("./utilities/interacting");
const Assistant = require("./assistant/Assistant");
const AmbientEngine = require("./assistant/ambient/AmbientEngine");
const { isDirectTrigger } = require("./assistant/ambient/heuristics");
const AssistantStore = require("./assistant/AssistantStore");
const EmbedFormManager = require("./utilities/EmbedFormManager");
const TimetableApi = require("./utilities/TimetableApi");
const CommandDeployer = require("./utilities/CommandDeployer");
const Notifier = require("./utilities/Notifier");
const { translator, userError, describeUserError } = require("./utilities/i18n");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
});

identity.setClient(client);
const logger = new Logger(client);
const interacting = new Interacting(logger);
const assignmentManager = new AssignmentManager(logger);
const assistantStore = new AssistantStore(logger);

let booted = false;
let assistant = null;
let ambient = null;
let notifier = null;

// AI output must never ping everyone or roles.
const SAFE_MENTIONS = { parse: ["users"], repliedUser: true };
const MAX_ATTACHMENT_MB = 10;
const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_MB * 1024 * 1024;
const DISCORD_MESSAGE_LIMIT = 2000;
const RATE_LIMIT = { maxRequests: 5, windowMs: 60000, cooldownMs: 10000, adminMultiplier: 2 };

const userCooldowns = new Map();
const activeTypingIndicators = new Map();

function checkRateLimit(userId, isAdmin = false) {
  const now = Date.now();
  const limit = isAdmin ? RATE_LIMIT.maxRequests * RATE_LIMIT.adminMultiplier : RATE_LIMIT.maxRequests;
  if (!userCooldowns.has(userId)) userCooldowns.set(userId, { requests: [], lastCooldown: 0 });
  const userData = userCooldowns.get(userId);

  if (userData.lastCooldown > now) {
    return { allowed: false, remainingMs: userData.lastCooldown - now, reason: "cooldown" };
  }

  userData.requests = userData.requests.filter((time) => time > now - RATE_LIMIT.windowMs);
  if (userData.requests.length >= limit) {
    userData.lastCooldown = now + RATE_LIMIT.cooldownMs;
    logger.logMessage(`[ NOTICE ] User ${userId} rate limited (${userData.requests.length}/${limit} requests)`);
    return { allowed: false, remainingMs: RATE_LIMIT.cooldownMs, reason: "rate_limit" };
  }

  userData.requests.push(now);
  return { allowed: true };
}

function cleanupCooldowns() {
  const now = Date.now();
  for (const [userId, data] of userCooldowns.entries()) {
    const hasRecentRequests = data.requests.some((time) => time > now - RATE_LIMIT.windowMs);
    if (data.lastCooldown < now && !hasRecentRequests) userCooldowns.delete(userId);
  }
}

function smartChunk(text, maxLength = DISCORD_MESSAGE_LIMIT) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const line of text.split("\n")) {
    if (line.length <= maxLength) {
      if ((current + line + "\n").length > maxLength) flush();
      current += line + "\n";
      continue;
    }
    flush();
    for (const word of line.split(" ")) {
      for (let i = 0; i < word.length; i += maxLength) {
        const piece = word.slice(i, i + maxLength);
        if ((current + piece + " ").length > maxLength) flush();
        current += piece + " ";
      }
    }
  }
  flush();
  return chunks;
}

function startTyping(channel) {
  stopTyping(channel);
  channel.sendTyping().catch(() => {});
  const interval = setInterval(() => channel.sendTyping().catch(() => stopTyping(channel)), 8000);
  activeTypingIndicators.set(channel.id, interval);
}

function stopTyping(channel) {
  clearInterval(activeTypingIndicators.get(channel.id));
  activeTypingIndicators.delete(channel.id);
}

async function sendChunkedReply(message, response) {
  if (!response?.trim()) return;
  const chunks = smartChunk(response);
  for (const [index, chunk] of chunks.entries()) {
    const payload = { content: chunk, allowedMentions: SAFE_MENTIONS };
    try {
      // Replying fails if the message was deleted.
      if (index === 0) await message.reply(payload).catch(() => message.channel.send(payload));
      else await message.channel.send(payload);
    } catch (err) {
      logger.logMessage(`[ ERROR ] Failed to send chunk ${index + 1}/${chunks.length}`, err);
    }
  }
}

async function downloadAttachment(attachment) {
  if (attachment.size > MAX_ATTACHMENT_SIZE) {
    throw userError("assistant.file.tooLarge", {
      size: (attachment.size / 1024 / 1024).toFixed(1),
      max: MAX_ATTACHMENT_MB,
    });
  }
  const response = await axios.get(attachment.url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: MAX_ATTACHMENT_SIZE,
  });
  return { buffer: Buffer.from(response.data), filename: attachment.name };
}

async function saveUserProfile(userId, { username, group, alias, dept, level, silent = false } = {}) {
  if (!userId || typeof userId !== "string") return null;
  if (!username) {
    const user = await client.users.fetch(userId).catch(() => null);
    username = user?.username || userId;
  }
  try {
    return assistantStore.upsertUser({ userId, username, group, alias, dept, level, silent });
  } catch (e) {
    logger.logMessage(`[ ERROR ] Failed to save user ${userId}`, e);
    return null;
  }
}

function resolveCommandHandler(commandName) {
  for (const level of permissions.LEVELS) {
    const handlerPath = `commands/${level}/${commandName}/handler.js`;
    if (moduleRegistry.has(handlerPath)) return { handler: moduleRegistry.load(handlerPath), level };
  }
  return null;
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!booted || !interaction.isChatInputCommand()) return;
  const { commandName, user } = interaction;
  const t = translator(interaction);
  saveUserProfile(user.id, { username: user.username, silent: true });
  logger.logMessage(`[ NOTICE ] /${commandName} used by ${user.username}`);

  const resolved = resolveCommandHandler(commandName);
  if (!resolved) {
    logger.logMessage(`[ ERROR ] No handler found for /${commandName}`);
    return;
  }

  if (!permissions.hasLevel(interaction, resolved.level)) {
    logger.logMessage(`[ NOTICE ] Permission denied for /${commandName} (${user.username})`);
    return interacting.replyToInteraction(interaction, t("common.permissionDenied"));
  }

  const deps = {
    t,
    user,
    logger,
    interacting,
    assistant,
    client,
    config,
    settings,
    permissions,
    app,
    assignmentManager,
    assistantStore,
    saveUserProfile,
    notifier,
    checkAllGroups: () => notifier.checkAllGroups(),
    checkRateLimit,
    EmbedFormManager,
    TimetableApi,
    SAFE_MENTIONS,
    downloadAttachment,
    smartChunk,
    shutdown,
  };

  try {
    await resolved.handler(interaction, deps);
  } catch (err) {
    logger.logMessage(`[ ERROR ] Unhandled error in /${commandName}`, err);
    await interacting.replyToInteraction(interaction, t("common.error.generic"));
  }
});

function getLLMErrorMessage(t, err) {
  const userMessage = describeUserError(t, err);
  if (userMessage) return userMessage;
  const msg = String(err?.message || "");
  if (msg.includes("Timeout")) return t("assistant.error.timeout");
  if (msg.includes("rate limit") || msg.includes("429")) return t("assistant.error.rateLimit");
  if (msg.includes("content policy") || msg.includes("safety")) return t("assistant.error.policy");
  return t("assistant.error.generic");
}

async function buildReplyContext(message) {
  if (!message.reference) return "";
  try {
    const referenced = await message.channel.messages.fetch(message.reference.messageId);
    const excerpt = referenced.content.slice(0, 500) + (referenced.content.length > 500 ? "..." : "");
    let context = `The user is replying to this message:\n**${referenced.author.username}**: "${excerpt}"`;
    if (referenced.attachments.size > 0) {
      const names = [...referenced.attachments.values()].map((a) => a.name);
      context += `\nAttachments: ${names.join(", ")}`;
    }
    return context;
  } catch (err) {
    logger.logMessage("[ ERROR ] Failed to fetch the referenced message", err);
    return "";
  }
}

async function handleAssistantMessage(message, extraContext = "") {
  const t = translator(message);
  const rateLimit = checkRateLimit(message.author.id, permissions.isAdmin(message));
  if (!rateLimit.allowed) {
    const reaction = await message.react(rateLimit.reason === "cooldown" ? "⏱️" : "🚫").catch(() => null);
    if (reaction) setTimeout(() => reaction.users.remove(client.user.id).catch(() => {}), rateLimit.remainingMs);
    return;
  }

  let fileObj = null;
  if (message.attachments.size > 0) {
    try {
      fileObj = await downloadAttachment(message.attachments.first());
    } catch (err) {
      logger.logMessage("[ ERROR ] Failed to download the attachment", err);
      const content = describeUserError(t, err) || t("assistant.file.invalid");
      await message.reply({ content, allowedMentions: SAFE_MENTIONS }).catch(() => {});
      return;
    }
  }

  const context = [extraContext, await buildReplyContext(message)].filter(Boolean).join("\n\n");
  startTyping(message.channel);
  const processingReaction = await message.react("⚡").catch(() => null);
  const cleanup = async () => {
    stopTyping(message.channel);
    await processingReaction?.users.remove(client.user.id).catch(() => {});
  };

  try {
    // No retry here: executed actions must not replay.
    const response = await assistant.generateContent(message.content, message, context, fileObj);
    await cleanup();
    await sendChunkedReply(message, response);
  } catch (err) {
    await cleanup();
    logger.logMessage("[ ERROR ] Assistant generation failed", err);
    await message.reply({ content: getLLMErrorMessage(t, err), allowedMentions: SAFE_MENTIONS }).catch(() => {});
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (!booted || message.author.bot) return;
  saveUserProfile(message.author.id, { username: message.author.username, silent: true });
  const inAssistantChannel = message.channel.id === settings.get().channels.assistant;
  const directCall = !inAssistantChannel && isDirectTrigger(message, identity.botName(), client.user.id);
  if (!inAssistantChannel && !directCall) {
    ambient?.observe(message);
    return;
  }

  try {
    const extraContext = directCall ? await ambient.contextFor(message) : "";
    await handleAssistantMessage(message, extraContext);
  } catch (err) {
    logger.logMessage("[ ERROR ] Unhandled error in the assistant channel", err);
    await message.reply(translator(message)("assistant.error.critical")).catch(() => {});
  }
});

function runDailyMaintenance() {
  logger.manageLogFiles();
  cleanupCooldowns();
}

client.once(Events.ClientReady, async () => {
  logger.logMessage(`[ SUCCESS ] Logged in as ${client.user.tag}`);
  if (migrated.length > 0) logger.logMessage(`[ NOTICE ] Migrated 1.7 data: ${migrated.join(", ")}`);
  if (fromEnv.length > 0) logger.logMessage(`[ NOTICE ] Set from the environment: ${fromEnv.join(", ")}`);
  const owners = await permissions.loadOwners(client).catch((error) => {
    logger.logMessage("[ ERROR ] Failed to fetch the application owner", error);
    return [];
  });
  logger.logMessage(`[ NOTICE ] Bot owner(s): ${owners.join(", ") || "none"}`);
  await new CommandDeployer(logger, client).deploy();

  assignmentManager.init();
  settings.onChange(() => assignmentManager.init());
  settings.watch(logger);
  assistant = new Assistant(logger, client, assignmentManager);
  ambient = new AmbientEngine({
    client,
    assistant,
    logger,
    settings,
    assistantStore,
    respond: (message, context) => handleAssistantMessage(message, context),
  });
  assistant.ambient = ambient;
  notifier = new Notifier({
    client,
    logger,
    settings,
    assignmentManager,
    assistantStore,
    timetableApi: new TimetableApi(),
    interacting,
  });
  booted = true;
  notifier.start({ onDaily: runDailyMaintenance });
});

async function initializeBot() {
  if (!process.env.DISCORD_TOKEN) {
    logger.logMessage("[ ERROR ] DISCORD_TOKEN is not set");
    process.exit(1);
  }

  for (const dir of [config.directories.logDirectory, config.directories.dataDirectory]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function shutdown(reason) {
  logger.logMessage(`[ NOTICE ] Shutting down (${reason})`);
  notifier?.stop();
  for (const interval of activeTypingIndicators.values()) clearInterval(interval);
  activeTypingIndicators.clear();
  await client.destroy().catch((error) => logger.logMessage("[ ERROR ] Failed to close the Discord client", error));
  process.exit(0);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.logMessage(
    "[ ERROR ] Unhandled promise rejection",
    reason instanceof Error ? reason : new Error(String(reason)),
  );
});

(async () => {
  await initializeBot();
  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    // Non-zero exit lets Docker restart the container.
    logger.logMessage("[ ERROR ] Failed to log in to Discord", error);
    process.exit(1);
  }
})();
