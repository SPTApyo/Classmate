module.exports = async function handler(args, interaction, { assistant }) {
  return { assignments: assistant.assignmentManager.getAllByGroup() };
};
