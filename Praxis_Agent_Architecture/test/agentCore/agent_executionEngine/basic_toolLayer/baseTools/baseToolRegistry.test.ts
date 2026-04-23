import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import type { BaseToolDefinition } from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  baseToolRegistryDescriptor,
  createBaseToolRegistry,
  loadBuiltinBaseToolDefinitions,
} from "../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

test("baseTool registry discovers the 203 builtin tool files with markdown toolSkill references", () => {
  const definitions = loadBuiltinBaseToolDefinitions();
  const registry = createBaseToolRegistry();
  const snapshot = registry.snapshot();

  assert.equal(baseToolRegistryDescriptor.builtinToolCountTarget, 203);
  assert.equal(definitions.length, 203);
  assert.equal(snapshot.builtins, 203);
  assert.equal(snapshot.customs, 0);
  assert.equal(snapshot.total, 203);
  assert.equal(snapshot.byFamily.code, 29);
  assert.equal(snapshot.byFamily.shell, 32);
  assert.equal(snapshot.byFamily.git, 35);
  assert.equal(snapshot.byFamily.custom, 0);

  for (const definition of definitions) {
    assert.equal(definition.source, "builtin");
    assert.equal(definition.toolSkill.riskLevel, definition.riskLevel);
    assert.equal(existsSync(definition.toolSkill.docPath), true, `${definition.toolId} missing toolSkill doc`);
    assert.ok(definition.dependencies.length > 0, `${definition.toolId} should declare dependencies`);
  }
});

test("baseTool registry exposes rough risk levels without replacing TAP governance", () => {
  const registry = createBaseToolRegistry();

  const read = registry.lookup("code.read");
  assert.equal(read.ok, true);
  if (!read.ok) throw new Error("code.read should exist");
  assert.equal(read.definition.riskLevel, "normal");
  assert.deepEqual(read.definition.permissionHints, ["filesystem:read"]);

  const shell = registry.lookup("shell.commandExecution");
  assert.equal(shell.ok, true);
  if (!shell.ok) throw new Error("shell.commandExecution should exist");
  assert.equal(shell.definition.riskLevel, "risky");
  assert.ok(shell.definition.permissionHints.includes("shell:execute"));

  const camera = registry.lookup("computeruse.cameraCapturePhoto");
  assert.equal(camera.ok, true);
  if (!camera.ok) throw new Error("computeruse.cameraCapturePhoto should exist");
  assert.equal(camera.definition.riskLevel, "dangerous");
  assert.ok(camera.definition.permissionHints.includes("device:camera"));
});

test("baseTool registry keeps custom tools on the same registration path", () => {
  const registry = createBaseToolRegistry({ includeBuiltins: false });
  const customDefinition: BaseToolDefinition = {
    toolId: "custom.issueSummarizer",
    source: "custom",
    family: "custom",
    title: "Custom issue summarizer",
    description: "Summarize issue text through a custom host implementation.",
    toolSkill: {
      docPath: "custom://issueSummarizer.md",
      summary: "Use for user-provided issue summarization workflows.",
      riskLevel: "normal",
    },
    inputSchema: { kind: "pending-schema", name: "custom.issueSummarizer.input" },
    outputSchema: { kind: "pending-schema", name: "custom.issueSummarizer.output" },
    riskLevel: "normal",
    permissionHints: ["custom:invoke"],
    dependencies: [
      {
        dependencyId: "custom-tool-provider",
        kind: "custom",
        required: true,
        description: "Host-provided custom tool implementation",
      },
    ],
    storagePolicy: {
      storesMaterial: true,
      storesResult: true,
      storesAudit: true,
      reusable: true,
    },
  };

  const registered = registry.registerCustomTool(customDefinition);
  assert.equal(registered.ok, true);
  assert.equal(registry.snapshot().customs, 1);

  const duplicate = registry.registerCustomTool(customDefinition);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.equal(duplicate.error.code, "DUPLICATE_TOOL_ID");
  }

  const lookup = registry.lookup("custom.issueSummarizer");
  assert.equal(lookup.ok, true);
});
