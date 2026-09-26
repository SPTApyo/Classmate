const crypto = require("crypto");

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 32;

module.exports = async function handler() {
  const token = Array.from({ length: TOKEN_LENGTH }, () => CHARS[crypto.randomInt(CHARS.length)]).join("");
  return { token };
};
