import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { locateLspTypeDefinition } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateTypeDefinition.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateTypeDefinition.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_locateTypeDefinition.md",
  testFileUrl: import.meta.url,
});

test("locateLspTypeDefinition returns a default dry-run type location envelope", async () => {
  const result = await locateLspTypeDefinition({
    target: { filePath: "src/model.ts", line: 10, character: 5, languageId: "typescript" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.locateTypeDefinition");
  assert.equal(result.output.target.languageId, "typescript");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.equal(result.output.locations[0]?.source, "dry-run");
  assert.deepEqual(result.output.permissionsRequired, ["workspace:read", "lsp:read"]);
});

test("locateLspTypeDefinition respects the governance guard before provider dispatch", async () => {
  let providerCalled = false;

  const result = await locateLspTypeDefinition({
    target: { filePath: "src/model.ts", line: 1, character: 1 },
    context: { dryRun: false, guard: { allowed: false, reason: "approval missing" } },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "GOVERNANCE_REJECTED");
    assert.equal(result.error.boundary, "governance");
    assert.equal(result.error.message, "approval missing");
  }
});

test("locateLspTypeDefinition can call an injected provider when explicitly requested", async () => {
  const result = await locateLspTypeDefinition({
    target: { filePath: "src/model.ts", line: 10, character: 5 },
    context: { dryRun: false, invocationId: "type-definition-1" },
    provider: () => [
      {
        filePath: "src/types.ts",
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 11 },
        },
        symbolName: "ModelType",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.locations[0]?.symbolName, "ModelType");
  assert.equal(result.audit[0]?.invocationId, "type-definition-1");
});
