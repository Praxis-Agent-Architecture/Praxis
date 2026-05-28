import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const assetExtensions = new Set([".md", ".json", ".txt", ".yaml", ".yml"]);
const copyRoots = [
  {
    sourceRoot: path.resolve("src"),
    distRoot: path.resolve("dist"),
  },
  {
    sourceRoot: path.resolve("raxode-tui/raxode-cli"),
    distRoot: path.resolve("raxode-tui/dist/raxode-cli"),
  },
];

async function copyAssets(directory, sourceRoot, distRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    if (entry.isDirectory()) {
      await copyAssets(source, sourceRoot, distRoot);
      continue;
    }
    if (!entry.isFile() || !assetExtensions.has(path.extname(entry.name))) {
      continue;
    }
    const relative = path.relative(sourceRoot, source);
    const target = path.join(distRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { force: true });
  }
}

for (const root of copyRoots) {
  await copyAssets(root.sourceRoot, root.sourceRoot, root.distRoot);
}
