const SIGNALS = [
  [
    /\?|\b(je sais pas|j'sais pas|sais pas|je sais plus|quelqu'un sait|qui sait|c'est quoi|comment|pourquoi|anyone know|does anyone|what is|how do|why)\b/i,
    2,
  ],
  [
    /\b(cours|edt|emploi du temps|demain|devoirs?|rendu|deadline|exam|examen|partiel|salle|qcm|sae|timetable|homework|assignment|room|tomorrow)\b/i,
    2,
  ],
  [/\b(aide|help|comprends pas|comprend rien|galère|galere|bloqué|bloque|explique|explain|stuck)\b/i, 1],
];
const MIN_LENGTH = 12;
const LONG_MESSAGE = 40;

function scoreMessage(text) {
  const content = String(text || "").trim();
  if (content.length < MIN_LENGTH) return 0;
  let score = content.length > LONG_MESSAGE ? 1 : 0;
  for (const [pattern, weight] of SIGNALS) {
    if (pattern.test(content)) score += weight;
  }
  return score;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function isDirectTrigger(message, name, botUserId) {
  if (message.mentions?.users?.has?.(botUserId)) return true;
  if (message.mentions?.repliedUser?.id === botUserId) return true;
  if (!name) return false;
  return new RegExp(`^\\s*${escapeRegex(name)}\\b`, "i").test(message.content || "");
}

module.exports = { scoreMessage, isDirectTrigger };
