import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import type { BaseToolDefinition } from "../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  baseToolRegistryDescriptor,
  createBaseToolRegistry,
  loadBuiltinBaseToolDefinitions,
} from "../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

test("baseTool registry discovers the active builtin tool files with markdown toolSkill references", () => {
  const definitions = loadBuiltinBaseToolDefinitions();
  const registry = createBaseToolRegistry();
  const snapshot = registry.snapshot();

  assert.equal(baseToolRegistryDescriptor.builtinToolCountTarget, 176);
  assert.equal(definitions.length, 176);
  assert.equal(snapshot.builtins, 176);
  assert.equal(snapshot.customs, 0);
  assert.equal(snapshot.total, 176);
  assert.equal(snapshot.byFamily.code, 29);
  assert.equal(snapshot.byFamily.shell, 33);
  assert.equal(snapshot.byFamily.git, 35);
  assert.equal(snapshot.byFamily.office, 0);
  assert.equal(snapshot.byFamily.skill, 6);
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
    group: "custom",
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

test("baseTool registry can resolve executable handlers for directoryized storage tools", () => {
  const registry = createBaseToolRegistry();

  const shellCommandExecutionHandler = registry.lookupHandler("shell.commandExecution");
  assert.equal(shellCommandExecutionHandler.ok, true);
  if (!shellCommandExecutionHandler.ok) {
    return;
  }

  assert.match(
    shellCommandExecutionHandler.handler.definition.toolSkill.docPath,
    /src\/storagePool\/baseToolStorage\/shellBase\/shellExecution\/shell\.commandExecution\/shell\.commandExecution\.md$/u,
  );

  const locateDefinitionHandler = registry.lookupHandler("code.lsp_locateDefinition");
  assert.equal(locateDefinitionHandler.ok, true);
  if (!locateDefinitionHandler.ok) {
    return;
  }

  assert.match(
    locateDefinitionHandler.handler.definition.toolSkill.docPath,
    /src\/storagePool\/baseToolStorage\/codeBase\/lsp\/code\.lsp_locateDefinition\/code\.lsp_locateDefinition\.md$/u,
  );

  const codeReadHandler = registry.lookupHandler("code.read");
  assert.equal(codeReadHandler.ok, true);
  if (!codeReadHandler.ok) {
    return;
  }

  assert.match(
    codeReadHandler.handler.definition.toolSkill.docPath,
    /src\/storagePool\/baseToolStorage\/codeBase\/explore\/code\.read\/code\.read\.md$/u,
  );

  const codeScanHandler = registry.lookupHandler("code.scan");
  assert.equal(codeScanHandler.ok, true);
  if (!codeScanHandler.ok) {
    return;
  }
  assert.match(
    codeScanHandler.handler.definition.toolSkill.docPath,
    /src\/storagePool\/baseToolStorage\/codeBase\/explore\/code\.scan\/code\.scan\.md$/u,
  );

  const codeSearchRipgrepHandler = registry.lookupHandler("code.search_Ripgrep");
  assert.equal(codeSearchRipgrepHandler.ok, true);
  if (!codeSearchRipgrepHandler.ok) {
    return;
  }
  assert.match(
    codeSearchRipgrepHandler.handler.definition.toolSkill.docPath,
    /src\/storagePool\/baseToolStorage\/codeBase\/explore\/code\.search_Ripgrep\/code\.search_Ripgrep\.md$/u,
  );

  for (const [toolId, docPathPattern] of [
    ["code.testCode", /src\/storagePool\/baseToolStorage\/codeBase\/testCode\/code\.testCode\/code\.testCode\.md$/u],
    ["code.benchmark", /src\/storagePool\/baseToolStorage\/codeBase\/testCode\/code\.benchmark\/code\.benchmark\.md$/u],
    ["code.debugCollectLogs", /src\/storagePool\/baseToolStorage\/codeBase\/debugCode\/code\.debugCollectLogs\/code\.debugCollectLogs\.md$/u],
    ["code.debugCaptureState", /src\/storagePool\/baseToolStorage\/codeBase\/debugCode\/code\.debugCaptureState\/code\.debugCaptureState\.md$/u],
    ["code.debugRun", /src\/storagePool\/baseToolStorage\/codeBase\/debugCode\/code\.debugRun\/code\.debugRun\.md$/u],
  ] as const) {
    const handler = registry.lookupHandler(toolId);
    assert.equal(handler.ok, true, `${toolId} handler should be mounted`);
    if (!handler.ok) {
      continue;
    }
    assert.match(handler.handler.definition.toolSkill.docPath, docPathPattern);
  }

  for (const toolId of ["skill.generate", "skill.iterate", "skill.management", "skill.remove", "skill.ripgrep", "skill.summarize"] as const) {
    const handler = registry.lookupHandler(toolId);
    assert.equal(handler.ok, true, `${toolId} handler should be mounted`);
    if (!handler.ok) continue;
    assert.match(
      handler.handler.definition.toolSkill.docPath,
      new RegExp(`src/storagePool/baseToolStorage/skillBase/${toolId}/${toolId}\\.md$`, "u"),
    );
  }
});
