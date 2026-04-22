import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { traceLspReferences } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceReferences.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceReferences.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceReferences.md",
  testFileUrl: import.meta.url,
});

test("traceLspReferences returns a dry-run references envelope", async () => {
  const result = await traceLspReferences({
    target: { filePath: "src/service.ts", line: 4, character: 8, languageId: "typescript" },
    includeDeclaration: true,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.traceReferences");
  assert.equal(result.output.target.languageId, "typescript");
  assert.equal(result.output.includeDeclaration, true);
  assert.equal(result.output.references[0]?.source, "dry-run");
  assert.equal(result.output.providerCalled, false);
});

test("traceLspReferences respects governance guard before provider dispatch", async () => {
  let providerCalled = false;

  const result = await traceLspReferences({
    target: { filePath: "src/service.ts", line: 1, character: 1 },
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
  }
});

test("traceLspReferences can call an injected provider when dry-run is disabled", async () => {
  const result = await traceLspReferences({
    target: { filePath: "src/service.ts", line: 4, character: 8 },
    context: { dryRun: false, invocationId: "references-1" },
    provider: () => [
      {
        filePath: "src/consumer.ts",
        range: {
          start: { line: 7, character: 2 },
          end: { line: 7, character: 9 },
        },
        symbolName: "Service",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.references[0]?.filePath, "src/consumer.ts");
  assert.equal(result.audit[0]?.invocationId, "references-1");
});
