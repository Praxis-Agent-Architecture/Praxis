import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { locateLspDefinition } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateDefinition.md",
  testFileUrl: import.meta.url,
});

test("locateLspDefinition returns an auditable dry-run location without calling a provider", async () => {
  let providerCalled = false;

  const result = await locateLspDefinition({
    target: { filePath: "src/example.ts", line: 3, character: 8 },
    context: { invocationId: "definition-1" },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.locateDefinition");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.locations[0]?.filePath, "src/example.ts");
  assert.equal(result.audit[0]?.invocationId, "definition-1");
});

test("locateLspDefinition classifies input and scope errors", async () => {
  const missing = await locateLspDefinition();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_FILE_PATH");
    assert.equal(missing.error.boundary, "input");
  }

  const scoped = await locateLspDefinition({
    target: { filePath: "src/outside.ts", line: 0, character: 0 },
    context: { allowedFilePaths: ["src/inside.ts"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
    assert.equal(scoped.error.boundary, "scope");
  }
});

test("locateLspDefinition uses an injected provider only when dryRun is disabled", async () => {
  const result = await locateLspDefinition({
    target: { filePath: "src/example.ts", line: 3, character: 8 },
    context: { dryRun: false },
    provider: (target) => [
      {
        filePath: "src/definition.ts",
        range: {
          start: { line: target.line + 1, character: 0 },
          end: { line: target.line + 1, character: 12 },
        },
        symbolName: "Example",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.dryRun, false);
  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.locations[0]?.filePath, "src/definition.ts");
  assert.equal(Object.isFrozen(result.output.locations), true);
});
