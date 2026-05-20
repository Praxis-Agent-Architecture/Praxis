import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { builtinBaseToolHandlers } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const architectureRoot = path.resolve(testDir, "../../../../../../");
const storageRoot = path.join(architectureRoot, "src/storagePool/baseToolStorage/shellBase");
const entryRoot = path.join(
  architectureRoot,
  "src/executionEngine/basic_toolLayer/baseTools/shellBase",
);
const builtinHandlersPath = path.join(
  architectureRoot,
  "src/executionEngine/basic_toolLayer/baseTools/builtinBaseToolHandlers.ts",
);

const requiredStorageFiles = [
  "anthropic.ts",
  "openai.ts",
  "deepmind.ts",
  "dependencies.ts",
  "bestPractice.ts",
  "core.ts",
] as const;
const requiredDocHeadings = [
  "## Use This Tool",
  "## Call Shape",
  "## Required Inputs",
  "## Optional Inputs",
  "## Runtime Behavior",
  "## Returns",
  "## Example",
  "## Avoid",
] as const;

function walkDirectories(root: string): string[] {
  const directories: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    directories.push(fullPath, ...walkDirectories(fullPath));
  }
  return directories;
}

function listShellStorageTools(): Array<{ toolId: string; group: string; storageDir: string }> {
  return walkDirectories(storageRoot)
    .filter((directory) => path.basename(directory).startsWith("shell."))
    .filter((directory) => existsSync(path.join(directory, "core.ts")))
    .map((storageDir) => ({
      toolId: path.basename(storageDir),
      group: path.basename(path.dirname(storageDir)),
      storageDir,
    }))
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
}

function assertFile(pathname: string, message: string): void {
  assert.equal(existsSync(pathname), true, message);
  assert.equal(statSync(pathname).isFile(), true, `${message} must be a file`);
}

test("shellBase engineering shape keeps every shell tool in the same storage and entry layout", () => {
  const tools = listShellStorageTools();
  assert.equal(tools.length, 33, "shellBase should expose exactly 33 storage-backed shell tools");

  for (const tool of tools) {
    for (const filename of requiredStorageFiles) {
      assertFile(path.join(tool.storageDir, filename), `${tool.toolId} must include ${filename}`);
    }
    assertFile(path.join(tool.storageDir, `${tool.toolId}.md`), `${tool.toolId} must include its toolSkill markdown`);

    const entryFile = path.join(entryRoot, tool.group, `${tool.toolId}.ts`);
    assertFile(entryFile, `${tool.toolId} must have a matching public entry file`);
    const entrySource = readFileSync(entryFile, "utf8");
    assert.doesNotMatch(entrySource, /^export \* from/m, `${tool.toolId} entry must not hide its surface behind export *`);
  }
});

test("shellBase toolSkill markdown keeps the operational manual shape", () => {
  const tools = listShellStorageTools();
  assert.equal(tools.length, 33);

  for (const tool of tools) {
    const markdownPath = path.join(tool.storageDir, `${tool.toolId}.md`);
    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /^---\n[\s\S]*?\n---/u, `${tool.toolId} markdown must start with frontmatter`);
    for (const heading of requiredDocHeadings) {
      assert.ok(markdown.includes(heading), `${tool.toolId} markdown must include ${heading}`);
    }
  }
});

test("shellBase registry, handler, storage, entry, and markdown identities stay locked", async () => {
  const tools = listShellStorageTools();
  const registry = createBaseToolRegistry();
  const shellHandlers = builtinBaseToolHandlers.filter((handler) => handler.definition.family === "shell");
  const shellHandlerIds = shellHandlers.map((handler) => handler.definition.toolId).sort();
  const storageToolIds = tools.map((tool) => tool.toolId).sort();
  const registryShellIds = registry
    .list()
    .filter((definition) => definition.family === "shell")
    .map((definition) => definition.toolId)
    .sort();

  assert.deepEqual(shellHandlerIds, storageToolIds, "builtin shell handlers must match storage-backed shell tools exactly");
  assert.deepEqual(registryShellIds, storageToolIds, "registry shell definitions must match storage-backed shell tools exactly");
  assert.equal(new Set(shellHandlerIds).size, 33, "builtin shell handler ids must not contain duplicates");

  const builtinSource = readFileSync(builtinHandlersPath, "utf8");
  const shellImportMatches = [...builtinSource.matchAll(/from "([^"]*storagePool\/baseToolStorage\/shellBase\/([^"]+)\/bestPractice\.js)"/gu)];
  assert.equal(shellImportMatches.length, 33, "builtinBaseToolHandlers.ts must import exactly 33 shell bestPractice handlers");

  for (const tool of tools) {
    const lookup = registry.lookupHandler(tool.toolId);
    assert.equal(lookup.ok, true, `${tool.toolId} must be invokable through registry.lookupHandler`);
    if (!lookup.ok) continue;

    assert.equal(lookup.handler.definition.toolId, tool.toolId, `${tool.toolId} handler definition must match lookup id`);
    assert.equal(lookup.handler.definition.family, "shell", `${tool.toolId} definition family must be shell`);
    assert.match(
      String(lookup.handler.definition.metadata?.storagePracticePath),
      new RegExp(`src/storagePool/baseToolStorage/shellBase/${tool.group}/${tool.toolId.replaceAll(".", "\\.")}/bestPractice\\.ts$`),
      `${tool.toolId} definition must point back to its storage bestPractice path`,
    );

    const entryFile = path.join(entryRoot, tool.group, `${tool.toolId}.ts`);
    const entryModule = await import(pathToFileURL(entryFile).href);
    const exportedDefinitions = Object.values(entryModule).filter(
      (value): value is { toolId: string; family: string } =>
        typeof value === "object" && value !== null && (value as { toolId?: unknown }).toolId === tool.toolId,
    );
    assert.ok(exportedDefinitions.length > 0, `${tool.toolId} public entry must export a toolId-bearing descriptor/definition`);
  }
});
