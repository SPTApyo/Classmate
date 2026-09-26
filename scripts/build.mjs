import { build } from "esbuild";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "dist");
const MODULE_DIRS = ["commands", "LLMEngine/actions"];
// Templates; real files live in the volume.
const DEFAULT_FILES = ["llmData.json", "config.example.json", "settings.example.json"];
// Optional native addons, loaded inside try/catch.
const OPTIONAL_NATIVE = ["bufferutil", "utf-8-validate", "zlib-sync", "erlpack"];

const toPosix = (p) => p.split(path.sep).join("/");

async function findModuleFiles(base, fileName) {
  const found = [];
  for (const category of await readdir(path.join(ROOT, base))) {
    const categoryDir = path.join(ROOT, base, category);
    if (!(await stat(categoryDir)).isDirectory()) continue;
    for (const name of await readdir(categoryDir)) {
      const file = path.join(categoryDir, name, fileName);
      if (existsSync(file)) found.push(toPosix(path.relative(ROOT, file)));
    }
  }
  return found;
}

const collect = async (fileName) => (await Promise.all(MODULE_DIRS.map((d) => findModuleFiles(d, fileName)))).flat();
const handlers = await collect("handler.js");
const manifests = [...(await collect("command.json")), ...(await collect("action.json"))];

// Static registry lets esbuild bundle dynamic handlers.
const staticRegistryPlugin = {
  name: "static-module-registry",
  setup(pluginBuild) {
    pluginBuild.onLoad({ filter: /utilities[\\/]moduleRegistry\.js$/ }, () => ({
      contents: [
        "const handlers = {",
        ...handlers.map((h) => `  ${JSON.stringify(h)}: () => require(${JSON.stringify("./" + h)}),`),
        "};",
        "module.exports = {",
        "  has: (relPath) => Object.prototype.hasOwnProperty.call(handlers, relPath),",
        "  load: (relPath) => handlers[relPath](),",
        "};",
      ].join("\n"),
      resolveDir: ROOT,
      loader: "js",
    }));
  },
};

await rm(OUT, { recursive: true, force: true });

const result = await build({
  entryPoints: [path.join(ROOT, "index.js")],
  outfile: path.join(OUT, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  legalComments: "none",
  charset: "utf8",
  external: OPTIONAL_NATIVE,
  plugins: [staticRegistryPlugin],
  metafile: true,
  logLevel: "warning",
});

// Command and action manifests are read at runtime.
for (const rel of manifests) {
  const target = path.join(OUT, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(JSON.parse(await readFile(path.join(ROOT, rel), "utf8"))));
}
await mkdir(path.join(OUT, "defaults"), { recursive: true });
for (const name of DEFAULT_FILES) {
  const source = await readFile(path.join(ROOT, "data", "config", name), "utf8");
  await writeFile(path.join(OUT, "defaults", name), source);
}

const bundleBytes = Object.values(result.metafile.outputs).reduce((sum, output) => sum + output.bytes, 0);
console.log(
  `Build OK: ${handlers.length} handlers bundled, ${manifests.length + DEFAULT_FILES.length} JSON files copied.`,
);
console.log(`dist/index.js: ${(bundleBytes / 1024).toFixed(0)} KB`);
