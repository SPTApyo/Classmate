const { EmbedBuilder, MessageFlags } = require("discord.js");
const { embedFooter } = require("./identity");
const Logger = require("./Logger");

const UNKNOWN_INTERACTION = 10062;

class Interacting {
  constructor(logger) {
    if (!(logger instanceof Logger)) {
      throw new Error("Logger must be an instance of Logger class");
    }
    this.logger = logger;
  }

  createEmbed(title, description, color, imageUrl) {
    const embed = new EmbedBuilder()
      .setColor(parseInt(color, 16))
      .setTitle(title)
      .setDescription(description || "")
      .setFooter(embedFooter())
      .setTimestamp();
    if (imageUrl) embed.setImage(imageUrl);
    return embed;
  }

  async replyToInteraction(interaction, content = null, embed = null, components = null, ephemeral = true) {
    if (!interaction || interaction.replied || interaction.deferred) return;
    const options = {};
    if (ephemeral) options.flags = MessageFlags.Ephemeral;
    if (content) options.content = content;
    if (embed) options.embeds = Array.isArray(embed) ? embed : [embed];
    if (components) options.components = components;
    try {
      await interaction.reply(options);
    } catch (e) {
      if (e?.code === UNKNOWN_INTERACTION) {
        this.logger.logMessage("[ NOTICE ] Interaction expired before the reply was sent");
        return;
      }
      this.logger.logMessage("[ ERROR ] Failed to reply to the interaction", e);
    }
  }

  // Ephemeral flag is fixed by the initial reply.
  async editInteraction(interaction, content = null, embed = null, components = null) {
    if (!interaction) return;
    const options = {};
    if (content) options.content = content;
    if (embed) options.embeds = Array.isArray(embed) ? embed : [embed];
    if (components) options.components = components;
    try {
      await interaction.editReply(options);
    } catch (e) {
      this.logger.logMessage("[ ERROR ] Failed to edit the interaction reply", e);
      await this.replyToInteraction(interaction, content, embed, components);
    }
  }
}

module.exports = Interacting;
