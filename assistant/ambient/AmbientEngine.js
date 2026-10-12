const { translator } = require("../../utilities/i18n");
const { botName } = require("../../utilities/identity");
const { scoreMessage } = require("./heuristics");

const BUFFER_LIMIT = 30;
const SUMMARIZE_BATCH = 20;
const MAX_LINE_CHARS = 280;
const MAX_SUMMARY_CHARS = 1200;
const MAX_WAIT_MS = 60000;
const OFFER_TIMEOUT_MS = 10 * 60 * 1000;
const FETCHED_CONTEXT_MESSAGES = 6;
const ACCEPT_EMOJI = "✅";
const HOUR_MS = 60 * 60 * 1000;

const DEFAULTS = {
  enabled: false,
  channels: [],
  minScore: 3,
  confidence: 0.75,
  debounceSeconds: 20,
  cooldownMinutes: 5,
  maxChecksPerHour: 20,
  maxInterventionsPerHour: 4,
  dailyTokenBudget: 200000,
  contextMessages: 8,
};

const CLASSIFIER_SCHEMA = {
  type: "OBJECT",
  properties: {
    intervene: { type: "BOOLEAN" },
    confidence: { type: "NUMBER" },
    intent: { type: "STRING", enum: ["tool", "knowledge", "none"] },
    topic: { type: "STRING" },
  },
  required: ["intervene", "confidence", "intent", "topic"],
};

const today = () => new Date().toISOString().slice(0, 10);
const recent = (timestamps, now) => timestamps.filter((time) => now - time < HOUR_MS);
const formatLine = (line) => `${line.author}: ${line.text}`;

class AmbientEngine {
  constructor({ client, assistant, logger, settings, assistantStore, respond }) {
    Object.assign(this, { client, assistant, logger, settings, assistantStore, respond });
    this.channels = new Map();
    this.checks = [];
    this.interventions = [];
    this.tokens = { day: today(), used: 0 };
    this.stats = { observed: 0, filtered: 0, classified: 0, rejected: 0, interventions: 0, offers: 0, accepted: 0 };
  }

  options() {
    return { ...DEFAULTS, ...(this.settings.get().ambient || {}) };
  }

  isWatched(channelId) {
    const options = this.options();
    return options.enabled && options.channels.includes(channelId);
  }

  stateFor(channelId) {
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, { lines: [], summary: "", candidate: null, timer: null, lastInterventionAt: 0 });
    }
    return this.channels.get(channelId);
  }

  observe(message) {
    if (!this.isWatched(message.channel.id)) return;
    const options = this.options();
    const state = this.stateFor(message.channel.id);
    this.stats.observed++;

    state.lines.push({
      id: message.id,
      author: message.author.username,
      text: message.content.replace(/\s+/g, " ").slice(0, MAX_LINE_CHARS),
    });
    if (state.lines.length > BUFFER_LIMIT) this.compact(state);

    const optedOut = this.assistantStore.isAmbientOptOut(message.author.id);
    if (!optedOut && scoreMessage(message.content) >= options.minScore) {
      state.candidate = { id: message.id, author: message.author.username, text: message.content };
      state.firstCandidateAt ||= Date.now();
    } else {
      this.stats.filtered++;
    }
    // Any message restarts the silence timer.
    if (state.candidate) this.schedule(message.channel.id, state, options);
  }

  schedule(channelId, state, options) {
    clearTimeout(state.timer);
    const deadline = state.firstCandidateAt + MAX_WAIT_MS;
    const wait = Math.max(0, Math.min(options.debounceSeconds * 1000, deadline - Date.now()));
    state.timer = setTimeout(() => {
      this.evaluate(channelId).catch((error) => this.logger.logMessage("[ ERROR ] Ambient evaluation failed", error));
    }, wait);
  }

  spend(tokens) {
    if (this.tokens.day !== today()) this.tokens = { day: today(), used: 0 };
    this.tokens.used += tokens;
  }

  hasBudget(options) {
    const now = Date.now();
    this.checks = recent(this.checks, now);
    if (this.tokens.day !== today()) this.tokens = { day: today(), used: 0 };
    return this.checks.length < options.maxChecksPerHour && this.tokens.used < options.dailyTokenBudget;
  }

  contextText(state, options) {
    const lines = state.lines.slice(-options.contextMessages).map(formatLine);
    return [state.summary ? `Conversation summary: ${state.summary}` : "", "Recent messages (oldest first):", ...lines]
      .filter(Boolean)
      .join("\n");
  }

  // Direct calls outside watched channels fetch once.
  async contextFor(message) {
    const options = this.options();
    if (this.isWatched(message.channel.id)) return this.contextText(this.stateFor(message.channel.id), options);
    const fetched = await message.channel.messages
      .fetch({ limit: FETCHED_CONTEXT_MESSAGES, before: message.id })
      .catch(() => null);
    if (!fetched?.size) return "";
    const lines = [...fetched.values()]
      .reverse()
      .map((msg) => formatLine({ author: msg.author.username, text: msg.content.slice(0, MAX_LINE_CHARS) }));
    return ["Recent messages (oldest first):", ...lines].join("\n");
  }

  async compact(state) {
    if (state.summarizing) return;
    state.summarizing = true;
    const batch = state.lines.splice(0, SUMMARIZE_BATCH);
    try {
      if (!this.hasBudget(this.options())) return;
      const prompt = [
        "Update this conversation summary in at most 5 short sentences, in the conversation language.",
        `Previous summary: ${state.summary || "none"}`,
        "New messages:",
        ...batch.map(formatLine),
      ].join("\n");
      const { text, tokens } = await this.assistant.generateText(prompt, 250);
      this.spend(tokens);
      state.summary = text.trim().slice(0, MAX_SUMMARY_CHARS);
    } catch (error) {
      this.logger.logMessage("[ ERROR ] Ambient summary failed", error);
    } finally {
      state.summarizing = false;
    }
  }

  classifierPrompt(state, candidate, options) {
    const name = botName();
    return [
      `You decide whether ${name}, a Discord assistant for a class, should join a conversation.`,
      `${name} can give a student's timetable, assignments, deadlines and free rooms, and answer knowledge questions.`,
      "Join only if a participant clearly needs information or help it can give right now.",
      "Never join small talk, jokes, opinions, questions meant for someone else, or already answered questions.",
      'intent "tool": needs timetable, assignments, rooms or other bot data. intent "knowledge": a learning question.',
      "topic: 3 to 8 words describing the need, in the conversation language.",
      "",
      this.contextText(state, options),
      "",
      `Message to evaluate: ${candidate.author}: ${candidate.text.slice(0, MAX_LINE_CHARS)}`,
    ].join("\n");
  }

  async evaluate(channelId) {
    const state = this.stateFor(channelId);
    const candidate = state.candidate;
    state.candidate = null;
    state.firstCandidateAt = 0;
    const options = this.options();
    if (!candidate || !this.isWatched(channelId)) return;

    const now = Date.now();
    if (now - state.lastInterventionAt < options.cooldownMinutes * 60000) return;
    if (!this.hasBudget(options)) return;

    this.checks.push(now);
    const { data: verdict, tokens } = await this.assistant.generateJson(
      this.classifierPrompt(state, candidate, options),
      CLASSIFIER_SCHEMA,
      400,
    );
    this.spend(tokens);
    this.stats.classified++;
    this.logger.logMessage(
      `[ AMBIENT ] ${candidate.author}: intervene=${verdict.intervene} confidence=${verdict.confidence} intent=${verdict.intent}`,
    );

    this.interventions = recent(this.interventions, now);
    const accepted = verdict.intervene && verdict.intent !== "none" && Number(verdict.confidence) >= options.confidence;
    if (!accepted || this.interventions.length >= options.maxInterventionsPerHour) {
      this.stats.rejected++;
      return;
    }

    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    const message = await channel?.messages.fetch(candidate.id).catch(() => null);
    if (!message) return;

    state.lastInterventionAt = now;
    this.interventions.push(now);
    const context = this.contextText(state, options);
    if (verdict.intent === "tool") {
      this.stats.interventions++;
      await this.respond(
        message,
        `${context}\nYou joined this conversation on your own: answer briefly, only what is needed.`,
      );
    } else {
      await this.offer(message, verdict.topic, context);
    }
  }

  async offer(message, topic, context) {
    const t = translator();
    this.stats.offers++;
    const offer = await message
      .reply({ content: t("ambient.offer", { topic }), allowedMentions: { repliedUser: false } })
      .catch(() => null);
    if (!offer) return;
    await offer.react(ACCEPT_EMOJI).catch(() => {});

    const collected = await offer
      .awaitReactions({
        filter: (reaction, user) => reaction.emoji.name === ACCEPT_EMOJI && user.id === message.author.id,
        max: 1,
        time: OFFER_TIMEOUT_MS,
      })
      .catch(() => null);
    await offer.delete().catch(() => {});
    if (!collected?.size) return;

    this.stats.accepted++;
    this.stats.interventions++;
    await this.respond(
      message,
      `${context}\nThe user accepted your offer to help with: ${topic}. Answer their question.`,
    );
  }

  getStats() {
    return { ...this.stats, tokensToday: this.tokens.used, watchedChannels: this.options().channels.length };
  }
}

module.exports = AmbientEngine;
