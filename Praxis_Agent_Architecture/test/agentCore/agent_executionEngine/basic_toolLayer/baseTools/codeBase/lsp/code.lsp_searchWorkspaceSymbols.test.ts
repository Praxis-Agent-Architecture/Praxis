import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { searchLspWorkspaceSymbols } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/codeBase/lsp/code.lsp_searchWorkspaceSymbols.js";
import { fakeLspServerSource } from "./fakeLspServer.js";

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

test("searchLspWorkspaceSymbols can use the built-in stdio LSP runtime", async () => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "praxis-lsp-workspace-symbols-"));

  try {
    const result = await searchLspWorkspaceSymbols({
      query: "Agent",
      context: { dryRun: false, workspaceRoot },
      runtime: {
        workspaceRoot,
        server: {
          command: process.execPath,
          args: [
            "-e",
            fakeLspServerSource({
              "workspace/symbol": [
                {
                  name: "AgentRuntime",
                  kind: 5,
                  location: {
                    uri: `file://${path.join(workspaceRoot, "agent.fake")}`,
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 12 } },
                  },
                },
              ],
            }),
          ],
          languageId: "fake",
          fileExtensions: [".fake"],
        },
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.output.symbols[0]?.name, "AgentRuntime");
      assert.equal(result.output.symbols[0]?.source, "provider");
      assert.equal(result.output.providerCalled, true);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
