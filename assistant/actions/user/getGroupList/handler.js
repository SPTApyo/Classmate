module.exports = async function handler(args, interaction, { assistant }) {
  return { groups: assistant.assignmentManager.getAllGroups() };
};
