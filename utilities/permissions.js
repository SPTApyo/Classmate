const { PermissionsBitField } = require("discord.js");
const { settings } = require("./config");

// Administrators implicitly have Manage Server.
const ADMIN_PERMISSION = PermissionsBitField.Flags.ManageGuild;

let ownerIds = new Set();

async function loadOwners(client) {
  const application = await client.application.fetch();
  const owner = application.owner;
  ownerIds = new Set(owner?.members ? [...owner.members.keys()] : owner ? [owner.id] : []);
  return [...ownerIds];
}

const isOwner = (userId) => ownerIds.has(userId);
const getOwnerIds = () => [...ownerIds];

// Source: interaction, message or { user, member }.
function isAdmin(source) {
  const userId = source?.user?.id || source?.author?.id;
  if (isOwner(userId)) return true;

  const member = source?.member;
  if (!member) return false;
  if (member.permissions?.has?.(ADMIN_PERMISSION)) return true;

  const extraRoles = settings.get().adminRoles || [];
  return extraRoles.length > 0 && !!member.roles?.cache?.some((role) => extraRoles.includes(role.id));
}

// Lowest first; folder names use these levels.
const LEVELS = ["user", "admin", "owner"];

function levelOf(source) {
  if (isOwner(source?.user?.id || source?.author?.id)) return "owner";
  return isAdmin(source) ? "admin" : "user";
}

const hasLevel = (source, required) => LEVELS.indexOf(levelOf(source)) >= LEVELS.indexOf(required);

module.exports = { ADMIN_PERMISSION, LEVELS, loadOwners, isOwner, getOwnerIds, isAdmin, levelOf, hasLevel };
