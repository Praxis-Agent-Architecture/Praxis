import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  baseTools,
  listBaseToolDeveloperCatalog,
  toolSets,
  tryBaseToolById,
} from "../../../../src/agentCore_runtimeImplementation/runtime.execEngine/baseToolDeveloperCatalog.js";

test("baseToolDeveloperCatalog exposes all registered tools without requiring handwritten family/group", () => {
  const catalog = listBaseToolDeveloperCatalog();
  const registry = createBaseToolRegistry();

  assert.equal(catalog.length, 176);
  for (const entry of catalog) {
    assert.equal(registry.lookup(entry.toolId).ok, true, entry.toolId);
    assert.notEqual(entry.storageFamily, "officeBase");
  }

  const codeRead = baseTools.code.read();
  assert.equal(codeRead.toolId, "code.read");
  assert.equal(codeRead.family, "codeBase");
  assert.equal(codeRead.group, "explore");
  assert.equal(codeRead.metadata?.baseToolFamily, "code");
  assert.equal(codeRead.metadata?.projection, "runtimeObservation");

  const lookup = tryBaseToolById("code.search_Ripgrep");
  assert.equal(lookup.ok, true);
  if (lookup.ok) {
    assert.equal(lookup.tool.group, "explore");
  }

  const missing = tryBaseToolById("code.noSuchTool");
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "BASE_TOOL_NOT_FOUND");
    assert.equal(missing.error.publicSafe, true);
  }
});

test("toolSets provide framework-level presets backed by registered BaseTool ids", () => {
  const registry = createBaseToolRegistry();
  const readonly = toolSets.coding.readonly({ includeGit: true, includeSearch: true });
  const full = toolSets.coding.full({ includeShell: true });
  const research = toolSets.research.web();
  const skillContext = toolSets.skill.context();
  const skillSearch = toolSets.skill.search();
  const skillAuthoring = toolSets.skill.authoring();

  assert.ok(readonly.some((item) => item.toolId === "code.read"));
  assert.ok(readonly.some((item) => item.toolId === "git.getRepositoryStatus"));
  assert.ok(readonly.some((item) => item.toolId === "search.fetch"));
  assert.ok(full.some((item) => item.toolId === "code.replaceFile"));
  assert.ok(full.some((item) => item.toolId === "shell.commandExecution"));
  assert.deepEqual(research.map((item) => item.toolId), ["search.searchEngine", "search.fetch", "search.ground"]);
  assert.deepEqual(skillContext.map((item) => item.toolId), ["skill.management", "skill.summarize"]);
  assert.deepEqual(skillSearch.map((item) => item.toolId), ["skill.management", "skill.summarize", "skill.ripgrep"]);
  assert.deepEqual(skillAuthoring.map((item) => item.toolId), ["skill.generate", "skill.iterate", "skill.remove"]);
  assert.equal(skillContext[0]?.metadata?.projection, "promptPackMaterial");
  assert.equal(skillContext[0]?.metadata?.modelRequired, false);

  for (const selected of [...readonly, ...full, ...research, ...skillContext, ...skillSearch, ...skillAuthoring]) {
    assert.equal(registry.lookup(selected.toolId).ok, true, selected.toolId);
  }
});
