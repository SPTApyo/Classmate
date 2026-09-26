const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");
const { settings } = require("./config");
const { translator } = require("./i18n");
const { embedFooter } = require("./identity");

const MAX_SELECT_OPTIONS = 25;
const MAX_OPTION_TEXT = 100;
const COLORS = { success: "00FF00", danger: "FF0000", info: "0000FF" };

const truncate = (text, max) => {
  const str = String(text ?? "");
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
};

class EmbedFormManager {
  constructor(interaction, interacting) {
    if (!interaction) throw new Error("EmbedFormManager requires an interaction.");
    if (!interacting) throw new Error("EmbedFormManager requires an Interacting instance.");
    this.interaction = interaction;
    this.interacting = interacting;
    this.t = translator(interaction);
    this.embed = null;
    this.components = [];
  }

  // colorTag: success, danger, info or hex color.
  createEmbed(title, description, colorTag) {
    const color = COLORS[colorTag] || colorTag || settings.get().appearance.embedGlobalColor;
    this.embed = new EmbedBuilder()
      .setTitle(truncate(title, 256))
      .setDescription(truncate(description || "​", 4096))
      .setColor(parseInt(color, 16))
      .setFooter(embedFooter())
      .setTimestamp();
    return this;
  }

  // Discord caps select menus at 25 options.
  addDropdown(customId, placeholder, options) {
    const safeOptions = options.slice(0, MAX_SELECT_OPTIONS).map((option) => ({
      ...option,
      label: truncate(option.label, MAX_OPTION_TEXT),
      value: truncate(option.value, MAX_OPTION_TEXT),
      ...(option.description ? { description: truncate(option.description, MAX_OPTION_TEXT) } : {}),
    }));
    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(truncate(placeholder, 150))
      .addOptions(safeOptions);
    this.components.push(new ActionRowBuilder().addComponents(menu));
    return this;
  }

  addButtons(buttons) {
    const row = buttons.map((btn) =>
      new ButtonBuilder()
        .setCustomId(btn.customId)
        .setLabel(btn.label)
        .setStyle(btn.style || ButtonStyle.Primary),
    );
    this.components.push(new ActionRowBuilder().addComponents(row));
    return this;
  }

  addRow(row) {
    this.components.push(row);
    return this;
  }

  async send() {
    if (!this.embed) throw new Error("Call createEmbed() before send().");
    await this.interacting.replyToInteraction(this.interaction, null, this.embed, this.components);
  }

  // Edits the initial reply, acknowledges component `i`.
  async update(i) {
    if (!this.embed) throw new Error("Call createEmbed() before update().");
    await this.interacting.editInteraction(this.interaction, null, this.embed, this.components);
    if (i && !i.deferred && !i.replied) {
      await i.deferUpdate().catch(() => {});
    }
  }

  // Components and modal submits; null on timeout.
  awaitInteraction(customIdPrefix, time = 60000) {
    const client = this.interaction.client;
    return new Promise((resolve) => {
      const listener = (i) => {
        if (i.user?.id !== this.interaction.user.id || !i.customId?.startsWith(customIdPrefix)) return;
        clearTimeout(timer);
        client.off(Events.InteractionCreate, listener);
        resolve(i);
      };
      const timer = setTimeout(() => {
        client.off(Events.InteractionCreate, listener);
        resolve(null);
      }, time);
      client.on(Events.InteractionCreate, listener);
    });
  }

  async awaitComponent(customIds, time = 60000) {
    const ids = [].concat(customIds);
    try {
      const message = await this.interaction.fetchReply();
      return await message.awaitMessageComponent({
        filter: (i) => i.user.id === this.interaction.user.id && ids.includes(i.customId),
        time,
      });
    } catch (e) {
      return null;
    }
  }

  async showTimeout(message = this.t("common.timeout.noAction")) {
    await this.createEmbed(this.t("common.timeout.title"), message, "danger").clearComponents().update();
  }

  clearComponents() {
    this.components = [];
    return this;
  }
}

module.exports = EmbedFormManager;
