const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { LOCALES } = require("../../../utilities/i18n");
const Notifier = require("../../../utilities/Notifier");
const { botName } = require("../../../utilities/identity");

const PANEL_TIMEOUT_MS = 10 * 60 * 1000;
const COLOR_REGEX = /^(0x|#)?([0-9a-fA-F]{6})$/;
const SNOWFLAKE_REGEX = /^\d{17,20}$/;
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const NEW_TASK = "__new__";
const CLOSED = Symbol("closed");

const SECTIONS = {
  general: "settings.sections.general",
  groups: "settings.sections.groups",
  channels: "settings.sections.channels",
  projects: "settings.sections.projects",
  adminRoles: "settings.sections.adminRoles",
  appearance: "settings.sections.appearance",
  llm: "settings.sections.llm",
  ambient: "settings.sections.ambient",
  notifications: "settings.sections.notifications",
};
const CHANNEL_LABELS = {
  assistant: "settings.channels.assistant",
  test: "settings.channels.test",
  log: "settings.channels.log",
  announcements: "settings.channels.announcements",
};
const COLOR_LABELS = {
  embedGlobalColor: "settings.appearance.global",
  embedAssignmentsColor: "settings.appearance.assignments",
  embedQuizzesColor: "settings.appearance.quizzes",
  embedProjectsColor: "settings.appearance.projects",
};

const AMBIENT_FIELDS = {
  minScore: ["settings.ambient.minScore", 0, 10],
  confidence: ["settings.ambient.confidence", 0, 1],
  debounceSeconds: ["settings.ambient.debounce", 0, 300],
  cooldownMinutes: ["settings.ambient.cooldown", 0, 1440],
  maxInterventionsPerHour: ["settings.ambient.maxPerHour", 0, 60],
};

const NOTIFICATION_TOGGLES = {
  ownerAlerts: "settings.notifications.ownerAlerts",
  newAssignments: "settings.notifications.newAssignments",
  timetableChanges: "settings.notifications.timetableChanges",
};
const NOTIFICATION_DEFAULTS = Notifier.DEFAULTS;
const MAX_DEADLINE_HOURS = 24 * 14;

const splitLines = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
};
const mention = (id) => (SNOWFLAKE_REGEX.test(id || "") ? `<#${id}>` : "—");
const validIds = (ids) => ids.filter((id) => SNOWFLAKE_REGEX.test(id || ""));

function textRow(customId, label, value, { style = TextInputStyle.Short, required = true, maxLength = 1000 } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);
  if (value) input.setValue(String(value).slice(0, maxLength));
  return new ActionRowBuilder().addComponents(input);
}

function buttonRow(...buttons) {
  return new ActionRowBuilder().addComponents(
    buttons.map(([customId, label, style = ButtonStyle.Secondary]) =>
      new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style),
    ),
  );
}

async function handler(interaction, deps) {
  const { t, interacting, logger, settings, user, downloadAttachment, EmbedFormManager, notifier } = deps;

  const file = interaction.options.getAttachment("file");
  if (file) {
    try {
      const { buffer } = await downloadAttachment(file);
      settings.replace(JSON.parse(buffer.toString("utf8")));
      logger.logMessage(`[ SUCCESS ] settings.json imported by ${user.username}`);
      return interacting.replyToInteraction(interaction, t("settings.imported"));
    } catch (error) {
      return interacting.replyToInteraction(interaction, t("settings.importError", { message: error.message }));
    }
  }

  const prefix = `settings:${interaction.id}:`;
  const id = (action) => `${prefix}${action}`;
  const form = new EmbedFormManager(interaction, interacting);

  const normalizeColor = (value) => {
    const match = value.trim().match(COLOR_REGEX);
    if (!match) throw new Error(t("settings.invalidColor", { value }));
    return `0x${match[2].toLowerCase()}`;
  };

  function homeView() {
    const s = settings.get();
    const none = t("settings.summary.none");
    const groups = s.tasks.map((task) => `${task.group} → ${mention(task.reminderChannelId)}`).join(", ") || none;
    const channels = Object.entries(CHANNEL_LABELS)
      .map(([key, label]) => `${t(label)} : ${mention(s.channels?.[key])}`)
      .join("\n");
    const roles = validIds(s.adminRoles || [])
      .map((roleId) => `<@&${roleId}>`)
      .join(", ");
    const description = [
      t("settings.hint"),
      "",
      `**${t("settings.summary.name")}** ${botName()} · **${t("settings.summary.language")}** ${s.defaultLocale} · **${t("settings.summary.location")}** ${s.location || none} · **${t("settings.summary.department")}** ${s.planning?.defaultDept || none}`,
      `**${t("settings.summary.groups")}** ${groups}`,
      `**${t("settings.summary.projects")}** ${(s.projectSubjects || []).join(", ") || none}`,
      `**${t("settings.summary.adminRoles")}** ${roles || none}`,
      `**${t("settings.summary.models")}** ${s.llm.models.join(", ")}`,
      `**${t("settings.summary.ambient")}** ${t(s.ambient?.enabled ? "settings.ambient.on" : "settings.ambient.off")} (${s.ambient?.channels?.length || 0})`,
      `**${t("settings.summary.notifications")}** ${notificationSummary()}`,
      "",
      channels,
    ].join("\n");

    const sectionMenu = new StringSelectMenuBuilder()
      .setCustomId(id("section"))
      .setPlaceholder(t("settings.placeholder"))
      .addOptions(Object.entries(SECTIONS).map(([value, label]) => ({ label: t(label), value })));
    return {
      title: t("settings.title"),
      description,
      rows: [
        new ActionRowBuilder().addComponents(sectionMenu),
        buttonRow([id("export"), t("settings.export")], [id("close"), t("settings.close"), ButtonStyle.Danger]),
      ],
    };
  }

  function channelsView() {
    const channels = settings.get().channels || {};
    const rows = Object.entries(CHANNEL_LABELS).map(([key, label]) => {
      const menu = new ChannelSelectMenuBuilder()
        .setCustomId(id(`channel:${key}`))
        .setPlaceholder(t(label))
        .setChannelTypes(TEXT_CHANNELS);
      if (SNOWFLAKE_REGEX.test(channels[key] || "")) menu.setDefaultChannels(channels[key]);
      return new ActionRowBuilder().addComponents(menu);
    });
    rows.push(buttonRow([id("back"), t("settings.back")]));
    return { title: t("settings.sections.channels"), description: t("settings.channelsHint"), rows };
  }

  function rolesView() {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(id("roles"))
      .setPlaceholder(t("settings.sections.adminRoles"))
      .setMinValues(0)
      .setMaxValues(25);
    const current = validIds(settings.get().adminRoles || []);
    if (current.length) menu.setDefaultRoles(current);
    return {
      title: t("settings.sections.adminRoles"),
      description: t("settings.rolesHint"),
      rows: [new ActionRowBuilder().addComponents(menu), buttonRow([id("back"), t("settings.back")])],
    };
  }

  function groupsView() {
    const options = settings.get().tasks.map((task) => ({
      label: task.group,
      value: task.group,
      description: hostOf(task.icsUrl),
    }));
    options.push({ label: t("settings.groups.add"), value: NEW_TASK });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(id("task"))
      .setPlaceholder(t("settings.groups.placeholder"))
      .addOptions(options.slice(0, 25));
    return {
      title: t("settings.sections.groups"),
      description: t("settings.groups.hint"),
      rows: [new ActionRowBuilder().addComponents(menu), buttonRow([id("back"), t("settings.back")])],
    };
  }

  function taskView(group) {
    const task = settings.get().tasks.find((item) => item.group === group);
    if (!task) return groupsView();
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(id(`task-channel:${group}`))
      .setPlaceholder(t("settings.groups.reminderChannel"))
      .setChannelTypes(TEXT_CHANNELS);
    if (SNOWFLAKE_REGEX.test(task.reminderChannelId)) menu.setDefaultChannels(task.reminderChannelId);
    const roleMenu = new RoleSelectMenuBuilder()
      .setCustomId(id(`task-role:${group}`))
      .setPlaceholder(t("settings.groups.role"))
      .setMinValues(0)
      .setMaxValues(1);
    if (SNOWFLAKE_REGEX.test(task.roleId || "")) roleMenu.setDefaultRoles(task.roleId);
    const none = t("settings.summary.none");
    return {
      title: t("settings.groups.title", { group }),
      description: [
        t("settings.groups.details", { host: hostOf(task.icsUrl), channel: mention(task.reminderChannelId) }),
        t("settings.groups.extra", {
          role: SNOWFLAKE_REGEX.test(task.roleId || "") ? `<@&${task.roleId}>` : none,
          level: task.level || none,
        }),
      ].join("\n"),
      rows: [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(roleMenu),
        buttonRow(
          [id(`task-edit:${group}`), t("settings.groups.editUrl"), ButtonStyle.Primary],
          [id(`task-delete:${group}`), t("settings.groups.delete"), ButtonStyle.Danger],
          [id("groups"), t("settings.back")],
        ),
      ],
    };
  }

  function ambientView() {
    const ambient = settings.get().ambient || {};
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(id("ambient-channels"))
      .setPlaceholder(t("settings.ambient.channels"))
      .setChannelTypes(TEXT_CHANNELS)
      .setMinValues(0)
      .setMaxValues(25);
    const current = validIds(ambient.channels || []);
    if (current.length) menu.setDefaultChannels(current);
    const tuning = Object.entries(AMBIENT_FIELDS)
      .map(([key, [label]]) => `${t(label)} : ${ambient[key] ?? "—"}`)
      .join("\n");
    return {
      title: t("settings.sections.ambient"),
      description: `${t("settings.ambient.hint")}\n\n**${t(ambient.enabled ? "settings.ambient.on" : "settings.ambient.off")}**\n${tuning}`,
      rows: [
        new ActionRowBuilder().addComponents(menu),
        buttonRow(
          [
            id("ambient-toggle"),
            t(ambient.enabled ? "settings.ambient.disable" : "settings.ambient.enable"),
            ambient.enabled ? ButtonStyle.Danger : ButtonStyle.Success,
          ],
          [id("ambient-tuning"), t("settings.ambient.tuning"), ButtonStyle.Primary],
          [id("back"), t("settings.back")],
        ),
      ],
    };
  }

  function ambientModal() {
    const ambient = settings.get().ambient || {};
    const modal = new ModalBuilder().setCustomId(id("modal:ambient")).setTitle(t("settings.sections.ambient"));
    for (const [key, [label]] of Object.entries(AMBIENT_FIELDS)) {
      modal.addComponents(textRow(key, t(label), String(ambient[key] ?? ""), { maxLength: 8 }));
    }
    return modal;
  }

  function notificationOptions() {
    return { ...NOTIFICATION_DEFAULTS, ...(settings.get().notifications || {}) };
  }

  function notificationSummary() {
    const n = notificationOptions();
    return t("settings.notifications.summary", {
      on: Object.keys(NOTIFICATION_TOGGLES).filter((key) => n[key]).length,
      total: Object.keys(NOTIFICATION_TOGGLES).length,
      hours: n.deadlineHours.join(", ") || "—",
      brief: n.eveningBriefHour ?? "—",
    });
  }

  function notificationsView() {
    const n = notificationOptions();
    const state = (value) => t(value ? "settings.ambient.on" : "settings.ambient.off");
    const lines = Object.entries(NOTIFICATION_TOGGLES).map(([key, label]) => `${t(label)} : **${state(n[key])}**`);
    lines.push(`${t("settings.notifications.deadlineHours")} : **${n.deadlineHours.join(", ") || "—"}**`);
    lines.push(`${t("settings.notifications.briefHour")} : **${n.eveningBriefHour ?? "—"}**`);
    return {
      title: t("settings.sections.notifications"),
      description: `${t("settings.notifications.hint")}\n\n${lines.join("\n")}`,
      rows: [
        buttonRow(
          ...Object.entries(NOTIFICATION_TOGGLES).map(([key, label]) => [
            id(`notif-toggle:${key}`),
            t(label),
            n[key] ? ButtonStyle.Success : ButtonStyle.Secondary,
          ]),
        ),
        buttonRow(
          [id("notif-tuning"), t("settings.ambient.tuning"), ButtonStyle.Primary],
          [id("back"), t("settings.back")],
        ),
      ],
    };
  }

  function notificationsModal() {
    const n = notificationOptions();
    return new ModalBuilder()
      .setCustomId(id("modal:notifications"))
      .setTitle(t("settings.sections.notifications"))
      .addComponents(
        textRow("deadlineHours", t("settings.notifications.deadlineHours"), n.deadlineHours.join(", "), {
          required: false,
          maxLength: 50,
        }),
        textRow("briefHour", t("settings.notifications.briefHour"), String(n.eveningBriefHour ?? ""), {
          required: false,
          maxLength: 2,
        }),
      );
  }

  async function toggleNotification(key, i) {
    const enable = !notificationOptions()[key];
    if (key === "ownerAlerts" && enable) {
      await i.deferUpdate();
      if (!notifier || (await notifier.testOwnerDMs()) === 0) {
        return { view: notificationsView, note: `❌ ${t("settings.notifications.ownerDmFailed")}` };
      }
    }
    settings.update((s) => {
      s.notifications = { ...s.notifications, [key]: enable };
    });
    return { view: notificationsView, saved: true };
  }

  function sectionModal(section) {
    const s = settings.get();
    const modal = new ModalBuilder().setCustomId(id(`modal:${section}`)).setTitle(t(SECTIONS[section]));
    if (section === "general") {
      modal.addComponents(
        textRow("name", t("settings.general.name"), s.assistantName, { required: false, maxLength: 32 }),
        textRow("locale", t("settings.general.locale"), s.defaultLocale, { maxLength: 5 }),
        textRow("location", t("settings.general.location"), s.location, { required: false, maxLength: 100 }),
        textRow("community", t("settings.general.community"), s.community, { required: false, maxLength: 200 }),
        textRow("dept", t("settings.general.department"), s.planning?.defaultDept, { maxLength: 20 }),
      );
    } else if (section === "projects") {
      modal.addComponents(
        textRow("names", t("settings.projects.field"), (s.projectSubjects || []).join("\n"), {
          style: TextInputStyle.Paragraph,
          required: false,
        }),
      );
    } else if (section === "llm") {
      modal.addComponents(
        textRow("models", t("settings.llm.field"), s.llm.models.join("\n"), { style: TextInputStyle.Paragraph }),
      );
    } else if (section === "appearance") {
      for (const [key, label] of Object.entries(COLOR_LABELS)) {
        modal.addComponents(textRow(key, t(label), s.appearance?.[key], { maxLength: 8 }));
      }
      modal.addComponents(
        textRow("icon", t("settings.appearance.icon"), s.appearance?.embedFooterIconUrl, { required: false }),
      );
    }
    return modal;
  }

  function taskModal(group) {
    const task = group ? settings.get().tasks.find((item) => item.group === group) : null;
    const modal = new ModalBuilder()
      .setCustomId(id(group ? `modal:task-edit:${group}` : "modal:task-new"))
      .setTitle((group ? t("settings.groups.editTitle", { group }) : t("settings.groups.newTitle")).slice(0, 45));
    if (!group) modal.addComponents(textRow("group", t("settings.groups.nameField"), "", { maxLength: 32 }));
    modal.addComponents(
      textRow("icsUrl", t("settings.groups.urlField"), task?.icsUrl, { style: TextInputStyle.Paragraph }),
      textRow("level", t("settings.groups.levelField"), task?.level, { required: false, maxLength: 20 }),
    );
    return modal;
  }

  function applyModal(section, fields) {
    const value = (name) => fields.getTextInputValue(name).trim();
    settings.update((s) => {
      if (section === "general") {
        const locale = value("locale").toLowerCase();
        if (!LOCALES[locale]) {
          throw new Error(t("settings.invalidLocale", { value: locale, locales: Object.keys(LOCALES).join(", ") }));
        }
        s.defaultLocale = locale;
        s.assistantName = value("name");
        s.location = value("location");
        s.community = value("community");
        s.planning = { ...s.planning, defaultDept: value("dept").toUpperCase() };
      } else if (section === "projects") {
        s.projectSubjects = splitLines(value("names"));
      } else if (section === "llm") {
        s.llm = { ...s.llm, models: splitLines(value("models")) };
      } else if (section === "appearance") {
        for (const key of Object.keys(COLOR_LABELS)) s.appearance[key] = normalizeColor(value(key));
        const icon = value("icon");
        if (icon && !/^https:\/\//.test(icon)) throw new Error(t("settings.invalidUrl", { value: icon }));
        if (icon) s.appearance.embedFooterIconUrl = icon;
        else delete s.appearance.embedFooterIconUrl;
      } else if (section === "ambient") {
        const tuning = {};
        for (const [key, [label, min, max]] of Object.entries(AMBIENT_FIELDS)) {
          const number = Number(value(key).replace(",", "."));
          if (!Number.isFinite(number) || number < min || number > max) {
            throw new Error(t("settings.invalidNumber", { name: t(label), min, max }));
          }
          tuning[key] = number;
        }
        s.ambient = { ...s.ambient, ...tuning };
      } else if (section === "notifications") {
        const hours = value("deadlineHours")
          .split(/[,;\s]+/)
          .filter(Boolean)
          .map(Number);
        if (hours.some((h) => !Number.isFinite(h) || h <= 0 || h > MAX_DEADLINE_HOURS)) {
          throw new Error(t("settings.notifications.invalidHours", { max: MAX_DEADLINE_HOURS }));
        }
        const brief = value("briefHour");
        const briefHour = brief === "" ? null : Number(brief);
        if (briefHour !== null && !(Number.isInteger(briefHour) && briefHour >= 0 && briefHour <= 23)) {
          throw new Error(
            t("settings.invalidNumber", { name: t("settings.notifications.briefHour"), min: 0, max: 23 }),
          );
        }
        const deadlineHours = [...new Set(hours)].sort((a, b) => b - a);
        s.notifications = { ...s.notifications, deadlineHours, eveningBriefHour: briefHour };
      }
    });
  }

  async function handle(action, i) {
    if (action === "close") return CLOSED;
    if (action === "back") return { view: homeView };
    if (action === "groups") return { view: groupsView };

    if (action === "export") {
      const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(settings.get(), null, 2)), {
        name: "settings.json",
      });
      await i.reply({ content: t("settings.exported"), files: [attachment], flags: MessageFlags.Ephemeral });
      return null;
    }

    if (action === "section") {
      const section = i.values[0];
      if (section === "groups") return { view: groupsView };
      if (section === "channels") return { view: channelsView };
      if (section === "adminRoles") return { view: rolesView };
      if (section === "ambient") return { view: ambientView };
      if (section === "notifications") return { view: notificationsView };
      await i.showModal(sectionModal(section));
      return null;
    }

    if (action.startsWith("channel:")) {
      const key = action.slice("channel:".length);
      settings.update((s) => {
        s.channels = { ...s.channels, [key]: i.values[0] };
      });
      return { view: channelsView, saved: true };
    }

    if (action === "ambient-channels") {
      settings.update((s) => {
        s.ambient = { ...s.ambient, channels: [...i.values] };
      });
      return { view: ambientView, saved: true };
    }
    if (action === "ambient-toggle") {
      settings.update((s) => {
        s.ambient = { ...s.ambient, enabled: !s.ambient?.enabled };
      });
      return { view: ambientView, saved: true };
    }
    if (action === "ambient-tuning") {
      await i.showModal(ambientModal());
      return null;
    }

    if (action.startsWith("notif-toggle:")) return toggleNotification(action.slice("notif-toggle:".length), i);
    if (action === "notif-tuning") {
      await i.showModal(notificationsModal());
      return null;
    }

    if (action === "roles") {
      settings.update((s) => {
        s.adminRoles = [...i.values];
      });
      return { view: rolesView, saved: true };
    }

    if (action === "task") {
      const group = i.values[0];
      if (group === NEW_TASK) {
        await i.showModal(taskModal(null));
        return null;
      }
      return { view: () => taskView(group) };
    }

    const [kind, group] = action.split(/:(.*)/s);
    if (kind === "task-channel") {
      settings.update((s) => {
        s.tasks.find((task) => task.group === group).reminderChannelId = i.values[0];
      });
      return { view: () => taskView(group), saved: true };
    }
    if (kind === "task-role") {
      settings.update((s) => {
        const task = s.tasks.find((item) => item.group === group);
        if (i.values[0]) task.roleId = i.values[0];
        else delete task.roleId;
      });
      return { view: () => taskView(group), saved: true };
    }
    if (kind === "task-edit") {
      await i.showModal(taskModal(group));
      return null;
    }
    if (kind === "task-delete") {
      settings.update((s) => {
        s.tasks = s.tasks.filter((task) => task.group !== group);
      });
      return { view: groupsView, note: t("settings.groups.deleted", { group }) };
    }

    if (action === "modal:task-new") {
      const newGroup = i.fields.getTextInputValue("group").trim().toUpperCase();
      const icsUrl = i.fields.getTextInputValue("icsUrl").trim();
      const level = i.fields.getTextInputValue("level").trim().toUpperCase();
      settings.update((s) => {
        s.tasks.push({
          group: newGroup,
          icsUrl,
          reminderChannelId: interaction.channelId,
          ...(level ? { level } : {}),
        });
      });
      return { view: () => taskView(newGroup), saved: true };
    }
    if (kind === "modal" && group.startsWith("task-edit:")) {
      const taskGroup = group.slice("task-edit:".length);
      const icsUrl = i.fields.getTextInputValue("icsUrl").trim();
      const level = i.fields.getTextInputValue("level").trim().toUpperCase();
      settings.update((s) => {
        const task = s.tasks.find((item) => item.group === taskGroup);
        task.icsUrl = icsUrl;
        if (level) task.level = level;
        else delete task.level;
      });
      return { view: () => taskView(taskGroup), saved: true };
    }
    if (kind === "modal") {
      applyModal(group, i.fields);
      const views = { ambient: ambientView, notifications: notificationsView };
      return { view: views[group] || homeView, saved: true };
    }
    return null;
  }

  const render = async (view, note, i) => {
    const { title, description, rows } = view();
    form.createEmbed(title, note ? `${note}\n\n${description}` : description, "info").clearComponents();
    rows.forEach((row) => form.addRow(row));
    if (i) await form.update(i);
    else await form.send();
  };

  let currentView = homeView;
  await render(currentView);

  for (;;) {
    const i = await form.awaitInteraction(prefix, PANEL_TIMEOUT_MS);
    if (!i) return form.showTimeout();

    let note;
    try {
      const result = await handle(i.customId.slice(prefix.length), i);
      if (result === CLOSED) {
        await form.createEmbed(t("settings.title"), t("settings.closed"), "info").clearComponents().update(i);
        return;
      }
      if (!result) continue;
      currentView = result.view;
      note = result.note || (result.saved ? t("settings.saved") : null);
      if (result.saved) logger.logMessage(`[ SUCCESS ] Settings updated from Discord by ${user.username}`);
    } catch (error) {
      note = `❌ ${error.message}`;
    }
    await render(currentView, note, i);
  }
}

module.exports = handler;
