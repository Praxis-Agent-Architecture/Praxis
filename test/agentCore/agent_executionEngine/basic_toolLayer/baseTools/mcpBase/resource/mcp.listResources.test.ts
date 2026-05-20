import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpListResources } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.listResources.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.listResources.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.listResources.md",
  testFileUrl: import.meta.url,
});

test("planMcpListResources creates a guarded dry-run listing envelope", () => {
  const result = planMcpListResources({
    target: {
      serverId: "filesystem-mcp",
      uriPrefix: "file:///workspace/",
      cursor: "page-1",
      limit: 25,
    },
    context: {
      invocationId: "list-1",
      allowedServerIds: ["filesystem-mcp"],
      allowedUriPrefixes: ["file:///workspace/"],
      grantedPermissions: ["mcp:connection:read", "mcp:resource:list"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.listResources");
  assert.equal(result.output.target.limit, 25);
  assert.deepEqual(result.output.resourceEnvelope.resources, []);
  assert.equal(result.output.resourceEnvelope.exhausted, false);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.audit[0]?.invocationId, "list-1");
});

test("planMcpListResources rejects missing server, invalid limit, and real execution", () => {
  const missing = planMcpListResources();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidLimit = planMcpListResources({
    target: { serverId: "filesystem-mcp", limit: 0 },
  });

  assert.equal(invalidLimit.ok, false);
  if (!invalidLimit.ok) {
    assert.equal(invalidLimit.error.code, "INVALID_LIMIT");
  }

  const real = planMcpListResources({
    target: { serverId: "filesystem-mcp" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planMcpListResources does not allow sibling uri prefixes", () => {
  const result = planMcpListResources({
    target: { serverId: "filesystem-mcp", uriPrefix: "file:///workspace-evil/" },
    context: { allowedUriPrefixes: ["file:///workspace"] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});
