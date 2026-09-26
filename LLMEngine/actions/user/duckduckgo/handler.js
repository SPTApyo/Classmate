const axios = require("axios");

const MAX_RESULTS = 5;
const REQUEST_TIMEOUT_MS = 10000;
// DuckDuckGo returns 403 without a browser user agent.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Fragile by nature: depends on DuckDuckGo markup.
const LINK_PATTERN = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_PATTERN = /<a[^>]+class="result__snippet"[^>]+href="[^"]+"[^>]*>([\s\S]*?)<\/a>/g;

const stripTags = (html) => html.replace(/<[^>]+>/g, "").trim();

module.exports = async function handler(args) {
  const { query } = args;
  if (!query) return { error: "No query provided." };

  try {
    const { data: html } = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": USER_AGENT },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const links = [...html.matchAll(LINK_PATTERN)].slice(0, MAX_RESULTS);
    // Titles and snippets appear in the same order.
    const snippets = [...html.matchAll(SNIPPET_PATTERN)];
    const results = links.map((link, index) => ({
      title: stripTags(link[2]),
      link: link[1],
      snippet: snippets[index] ? stripTags(snippets[index][1]) : "",
    }));

    return results.length ? { results } : { message: "No results found for this query." };
  } catch (error) {
    return { error: `Search failed: ${error.message}` };
  }
};
