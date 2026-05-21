import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../src/basetool/registry.js";
import {
  baseTools,
  listBaseToolDeveloperCatalog,
  toolSets,
  tryBaseToolById,
} from "../../../../src/runtimeImplementation/runtime.execEngine/baseToolDeveloperCatalog.js";

test("baseToolDeveloperCatalog exposes all registered tools without requiring handwritten family/group", () => {
  const catalog = listBaseToolDeveloperCatalog();
  const registry = createBaseToolRegistry();

  assert.equal(catalog.length, 16);
  for (const entry of catalog) {
    assert.equal(registry.lookup(entry.toolId).ok, true, entry.toolId);
    assert.notEqual(entry.storageFamily, "officeBase");
  }

  const codeRead = baseTools.code.read();
  assert.equal(codeRead.toolId, "file.read");
  assert.equal(codeRead.family, "coreBase");
  assert.equal(codeRead.group, "filesystem");
  assert.equal(codeRead.metadata?.basetoolLayer, "core");
  assert.equal(codeRead.metadata?.policyRisk, "safe");

  const lookup = tryBaseToolById("file.search");
  assert.equal(lookup.ok, true);
  if (lookup.ok) {
    assert.equal(lookup.tool.group, "filesystem");
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
  const readonly = toolSets.coding.readonly({ includeSearch: true });
  const full = toolSets.coding.full({ includeShell: true });
  const research = toolSets.research.web();
  const skillContext = toolSets.skill.context();
  const skillSearch = toolSets.skill.search();
  const skillAuthoring = toolSets.skill.authoring();

  assert.ok(readonly.some((item) => item.toolId === "file.read"));
  assert.ok(readonly.some((item) => item.toolId === "file.search"));
  assert.ok(readonly.some((item) => item.toolId === "web.fetch"));
  assert.ok(full.some((item) => item.toolId === "patch.apply"));
  assert.ok(full.some((item) => item.toolId === "shell.run"));
  assert.deepEqual(research.map((item) => item.toolId), ["web.search", "web.fetch"]);
  assert.deepEqual(skillContext.map((item) => item.toolId), ["skill.load"]);
  assert.deepEqual(skillSearch.map((item) => item.toolId), ["skill.load", "file.search"]);
  assert.deepEqual(skillAuthoring.map((item) => item.toolId), ["skill.load"]);
  assert.equal(skillContext[0]?.metadata?.basetoolLayer, "agent");
  assert.equal(skillContext[0]?.metadata?.policyRisk, "safe");

  for (const selected of [...readonly, ...full, ...research, ...skillContext, ...skillSearch, ...skillAuthoring]) {
    assert.equal(registry.lookup(selected.toolId).ok, true, selected.toolId);
  }
});
