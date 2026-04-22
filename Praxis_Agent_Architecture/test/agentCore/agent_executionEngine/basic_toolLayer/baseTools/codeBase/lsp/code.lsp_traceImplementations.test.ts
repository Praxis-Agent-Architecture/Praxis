import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { traceLspImplementations } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_traceImplementations.md",
  testFileUrl: import.meta.url,
});

test("traceLspImplementations returns a dry-run implementation envelope", async () => {
  const result = await traceLspImplementations({
    target: { filePath: "src/service.ts", line: 4, character: 8, languageId: "typescript" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.traceImplementations");
  assert.equal(result.output.target.languageId, "typescript");
  assert.equal(result.output.implementations[0]?.source, "dry-run");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
});

test("traceLspImplementations rejects targets outside allowed file scope", async () => {
  let providerCalled = false;

  const result = await traceLspImplementations({
    target: { filePath: "src/other.ts", line: 1, character: 1 },
    context: { dryRun: false, allowedFilePaths: ["src/service.ts"] },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});

test("traceLspImplementations can call an injected provider when dry-run is disabled", async () => {
  const result = await traceLspImplementations({
    target: { filePath: "src/service.ts", line: 4, character: 8 },
    context: { dryRun: false, invocationId: "implementations-1" },
    provider: () => [
      {
        filePath: "src/service.impl.ts",
        range: {
          start: { line: 20, character: 0 },
          end: { line: 20, character: 12 },
        },
        symbolName: "ServiceImpl",
        source: "provider",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.implementations[0]?.symbolName, "ServiceImpl");
  assert.equal(result.audit[0]?.invocationId, "implementations-1");
});
