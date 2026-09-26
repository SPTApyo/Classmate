const axios = require("axios");
const { config } = require("./config");
const { userError } = require("./i18n");

const MAX_TEXT_CHARS = 60000;
const MIN_PDF_TEXT_CHARS = 50;
const CONVERTER_TIMEOUT_MS = 30000;
const MAX_CONVERTER_RESPONSE_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "json",
  "log",
  "js",
  "ts",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "cs",
  "css",
  "xml",
  "yml",
  "yaml",
  "sql",
  "sh",
]);
const DOCUMENT_EXTENSIONS = new Set(["pdf", "docx", "pptx", "xlsx", "xls", "epub", "html", "htm"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "rar", "7z", "tar", "gz", "doc", "ppt"]);

// Real format must match the claimed extension.
const SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46],
  zip: [0x50, 0x4b, 0x03, 0x04],
  ole: [0xd0, 0xcf, 0x11, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47],
  jpeg: [0xff, 0xd8, 0xff],
  riff: [0x52, 0x49, 0x46, 0x46],
};
const EXPECTED_SIGNATURE = {
  pdf: "pdf",
  docx: "zip",
  pptx: "zip",
  xlsx: "zip",
  epub: "zip",
  xls: "ole",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "riff",
};
const EXECUTABLE_SIGNATURES = [
  [0x7f, 0x45, 0x4c, 0x46],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xca, 0xfe, 0xba, 0xbe],
];

// Hidden characters used to smuggle instructions.
const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const SUPPORTED = [...Object.keys(IMAGE_TYPES), ...DOCUMENT_EXTENSIONS, ...TEXT_EXTENSIONS];

const extensionOf = (filename) =>
  String(filename || "")
    .split(".")
    .pop()
    .toLowerCase();
const startsWith = (buffer, bytes) => bytes.every((byte, i) => buffer[i] === byte);

function looksExecutable(buffer) {
  if (EXECUTABLE_SIGNATURES.some((signature) => startsWith(buffer, signature))) return true;
  // Windows PE: "MZ" header followed by binary data.
  return startsWith(buffer, [0x4d, 0x5a]) && buffer.subarray(0, 512).includes(0);
}

function assertSignature(buffer, ext, filename) {
  const signature = SIGNATURES[EXPECTED_SIGNATURE[ext]];
  if (!signature || !startsWith(buffer, signature)) throw userError("assistant.file.rejected", { name: filename });
}

function decodeText(buffer, filename) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (text.includes("\0")) throw new Error("binary content");
    return text;
  } catch {
    throw userError("assistant.file.rejected", { name: filename });
  }
}

function sanitizeText(text) {
  const cleaned = text
    .replace(INVISIBLE_CHARS, "")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (cleaned.length <= MAX_TEXT_CHARS) return cleaned;
  const omitted = cleaned.length - MAX_TEXT_CHARS;
  return `${cleaned.slice(0, MAX_TEXT_CHARS)}\n\n[... truncated: ${omitted} more characters]`;
}

async function convertToMarkdown(buffer, filename) {
  const url = config.converter?.url;
  if (!url) return null;
  const { data } = await axios.post(`${url}/convert`, buffer, {
    headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(filename) },
    timeout: CONVERTER_TIMEOUT_MS,
    maxContentLength: MAX_CONVERTER_RESPONSE_BYTES,
    maxBodyLength: Infinity,
  });
  return typeof data?.markdown === "string" ? data.markdown : null;
}

const inline = (mimeType, buffer) => ({ inlineData: { mimeType, data: buffer.toString("base64") } });

// Returns { kind, parts, text }; text is sanitized.
async function ingestFile({ buffer, filename }, logger) {
  const ext = extensionOf(filename);
  if (!buffer?.length) throw userError("assistant.file.invalid");
  if (looksExecutable(buffer)) throw userError("assistant.file.rejected", { name: filename });

  if (IMAGE_TYPES[ext]) {
    assertSignature(buffer, ext, filename);
    if (ext === "webp" && buffer.toString("latin1", 8, 12) !== "WEBP") {
      throw userError("assistant.file.rejected", { name: filename });
    }
    return { kind: "image", parts: [inline(IMAGE_TYPES[ext], buffer)], text: null };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    return { kind: "text", parts: [], text: sanitizeText(decodeText(buffer, filename)) };
  }

  if (DOCUMENT_EXTENSIONS.has(ext)) {
    if (ext === "html" || ext === "htm") decodeText(buffer, filename);
    else assertSignature(buffer, ext, filename);

    let markdown = null;
    try {
      markdown = await convertToMarkdown(buffer, filename);
    } catch (error) {
      logger?.logMessage(`[ NOTICE ] File converter unavailable for ${filename}: ${error.message}`);
    }

    // Scanned PDFs: Gemini reads the pages visually.
    if (ext === "pdf" && (markdown === null || markdown.trim().length < MIN_PDF_TEXT_CHARS)) {
      return { kind: "pdf", parts: [inline("application/pdf", buffer)], text: null };
    }
    if (markdown === null) throw userError("assistant.file.conversionFailed", { ext });
    return { kind: "document", parts: [], text: sanitizeText(markdown) };
  }

  if (ARCHIVE_EXTENSIONS.has(ext)) throw userError("assistant.file.convert", { ext });
  throw userError("assistant.file.unsupported", { ext, supported: SUPPORTED.join(", ") });
}

module.exports = { ingestFile, sanitizeText, extensionOf, IMAGE_TYPES };
