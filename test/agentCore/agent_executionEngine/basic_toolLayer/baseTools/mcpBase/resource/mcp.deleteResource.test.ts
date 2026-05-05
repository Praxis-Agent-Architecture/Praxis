import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpDeleteResource } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.deleteResource.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.deleteResource.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/resource/mcp.deleteResource.md",
  testFileUrl: import.meta.url,
});

test("planMcpDeleteResource creates a guarded dry-run deletion envelope", () => {
  const result = planMcpDeleteResource({
    target: {
      serverId: "filesystem-mcp",
      uri: "file:///workspace/old-note.md",
      expectedRevision: "rev-1",
    },
    reason: "cleanup",
    context: {
      invocationId: "delete-1",
      allowedServerIds: ["filesystem-mcp"],
      allowedUriPrefixes: ["file:///workspace/"],
      grantedPermissions: ["mcp:connection:read", "mcp:resource:delete"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.deleteResource");
  assert.equal(result.output.target.expectedRevision, "rev-1");
  assert.equal(result.output.resourceEnvelope.deleted, false);
  assert.equal(result.output.resourceEnvelope.deletionPlanned, true);
  assert.equal(result.output.resourceEnvelope.reason, "cleanup");
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(result.audit[0]?.invocationId, "delete-1");
});

test("planMcpDeleteResource rejects missing target, denied uri scope, and real execution", () => {
  const missing = planMcpDeleteResource();

  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SERVER_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const denied = planMcpDeleteResource({
    target: { serverId: "filesystem-mcp", uri: "file:///outside/old-note.md" },
    context: { allowedUriPrefixes: ["file:///workspace/"] },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_REJECTED");
  }

  const real = planMcpDeleteResource({
    target: { serverId: "filesystem-mcp", uri: "file:///workspace/old-note.md" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planMcpDeleteResource does not allow sibling uri prefixes", () => {
  const result = planMcpDeleteResource({
    target: { serverId: "filesystem-mcp", uri: "file:///workspace-evil/old-note.md" },
    context: { allowedUriPrefixes: ["file:///workspace"] },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SCOPE_REJECTED");
    assert.equal(result.error.boundary, "scope");
  }
});
