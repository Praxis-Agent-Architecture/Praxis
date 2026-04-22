import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { searchLspWorkspaceSymbols } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.md",
  testFileUrl: import.meta.url,
});

test("searchLspWorkspaceSymbols returns a dry-run workspace symbol envelope", async () => {
  const result = await searchLspWorkspaceSymbols({ query: "AgentRuntime", limit: 10 });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.lsp.searchWorkspaceSymbols");
  assert.equal(result.output.query, "AgentRuntime");
  assert.equal(result.output.limit, 10);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.providerCalled, false);
  assert.deepEqual(result.output.permissionsRequired, ["workspace:read", "lsp:read"]);
});

test("searchLspWorkspaceSymbols rejects blank queries before provider dispatch", async () => {
  let providerCalled = false;

  const result = await searchLspWorkspaceSymbols({
    query: " ",
    context: { dryRun: false },
    provider: () => {
      providerCalled = true;
      return [];
    },
  });

  assert.equal(result.ok, false);
  assert.equal(providerCalled, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_SYMBOL_NAME");
    assert.equal(result.error.boundary, "input");
  }
});

test("searchLspWorkspaceSymbols can call an injected provider when dry-run is disabled", async () => {
  const result = await searchLspWorkspaceSymbols({
    query: "Agent",
    context: { dryRun: false, invocationId: "workspace-symbols-1" },
    provider: () => [
      {
        name: "AgentRuntime",
        kind: "class",
        detail: "runtime surface",
      },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.providerCalled, true);
  assert.equal(result.output.symbols[0]?.name, "AgentRuntime");
  assert.equal(result.output.symbols[0]?.source, "provider");
  assert.equal(result.audit[0]?.invocationId, "workspace-symbols-1");
});
