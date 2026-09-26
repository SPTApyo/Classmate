const DIRECTIVE = /^(eslint|global|globals|exported)\b/;
const WORD = /[\p{L}\p{N}]/u;
const NON_ASCII_LETTER = /[^\t\n\r -~]/;

module.exports = {
  meta: {
    type: "suggestion",
    docs: { description: "Keep comments short and in English" },
    schema: [
      {
        type: "object",
        properties: { max: { type: "integer", minimum: 1 }, ascii: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong: "Comment has {{count}} words (max {{max}}). Say why, not what changed.",
      notEnglish: "Comments must be written in English.",
    },
  },
  create(context) {
    const { max = 8, ascii = true } = context.options[0] || {};
    const sourceCode = context.sourceCode;

    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type === "Shebang") continue;
          const text = comment.value.replace(/^\s*\*/gm, " ").trim();
          if (DIRECTIVE.test(text)) continue;

          const count = text.split(/\s+/).filter((word) => WORD.test(word)).length;
          if (count > max) {
            context.report({ loc: comment.loc, messageId: "tooLong", data: { count, max } });
          }
          if (ascii && NON_ASCII_LETTER.test(text)) {
            context.report({ loc: comment.loc, messageId: "notEnglish" });
          }
        }
      },
    };
  },
};
