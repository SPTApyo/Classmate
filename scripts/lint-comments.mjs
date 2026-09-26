import { ESLint } from "eslint";
import maxCommentWords from "../eslint-rules/max-comment-words.js";

const eslint = new ESLint({
  overrideConfig: {
    plugins: { local: { rules: { "max-comment-words": maxCommentWords } } },
    rules: { "local/max-comment-words": ["error", { max: 8, ascii: true }] },
  },
});

const targets = process.argv.slice(2);
const results = await eslint.lintFiles(targets.length ? targets : ["."]);
const output = (await eslint.loadFormatter("stylish")).format(results);
if (output) console.log(output);
process.exitCode = results.some((result) => result.errorCount > 0) ? 1 : 0;
