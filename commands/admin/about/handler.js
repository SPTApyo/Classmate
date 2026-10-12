async function handler(interaction, { t, app, interacting }) {
  const info = t("about.info", {
    name: app.name,
    author: app.author,
    version: app.version,
    license: app.license,
  });
  await interacting.replyToInteraction(interaction, info);
}

module.exports = handler;
