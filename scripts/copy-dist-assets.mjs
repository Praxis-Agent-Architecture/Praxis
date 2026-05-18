import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const assetExtensions = new Set([".md", ".json", ".txt", ".yaml", ".yml"]);
const internalNotes = new Set(["raxodeProviderConfiguration.md"]);
const sourceRoot = path.resolve("src");
const distRoot = path.resolve("dist");

async function copyAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await copyAssets(source);
      continue;
    }
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) {
      continue;
    }
    if (internalNotes.has(entry.name)) {
      continue;
    }
    const relative = path.relative(sourceRoot, source);
    const target = path.join(distRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
}

await copyAssets(sourceRoot);
