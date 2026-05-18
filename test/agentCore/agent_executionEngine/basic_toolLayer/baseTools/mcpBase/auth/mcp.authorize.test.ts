import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import { planMcpAuthorize } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authorize.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authorize.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authorize.md",
  testFileUrl: import.meta.url,
});

test("planMcpAuthorize creates a dry-run policy envelope", () => {
  const result = planMcpAuthorize({
    target: {
      serverId: "filesystem",
      subjectId: " runtime:agent-1 ",
      action: "call-tool",
      toolName: " read_file ",
      requestedScopes: ["tool:read", "tool:read", "resource:read"],
    },
    context: {
      invocationId: "mcp-authorize-1",
      allowedServerIds: ["filesystem"],
      grantedPermissions: ["mcp:auth", "mcp:read"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.kind, "agentCore.basicTool.mcp.authorize");
  assert.equal(result.output.authorizationGranted, false);
  assert.equal(result.output.decision, "dry-run-policy-envelope");
  assert.equal(result.output.policyInput.subjectId, "runtime:agent-1");
  assert.equal(result.output.policyInput.toolName, "read_file");
  assert.deepEqual(result.output.policyInput.requestedScopes, ["tool:read", "resource:read"]);
  assert.equal(result.audit[0]?.invocationId, "mcp-authorize-1");
});

test("planMcpAuthorize rejects missing subject/action, scope gaps, permission gaps, and real execution", () => {
  const missingSubject = planMcpAuthorize({
    target: { serverId: "filesystem", action: "read-resource" },
  });

  assert.equal(missingSubject.ok, false);
  if (!missingSubject.ok) {
    assert.equal(missingSubject.error.code, "MISSING_SUBJECT_ID");
  }

  const missingAction = planMcpAuthorize({
    target: { serverId: "filesystem", subjectId: "runtime:agent-1" },
  });

  assert.equal(missingAction.ok, false);
  if (!missingAction.ok) {
    assert.equal(missingAction.error.code, "MISSING_AUTH_ACTION");
  }

  const scoped = planMcpAuthorize({
    target: { serverId: "browser", subjectId: "runtime:agent-1", action: "subscribe" },
    context: { allowedServerIds: ["filesystem"] },
  });

  assert.equal(scoped.ok, false);
  if (!scoped.ok) {
    assert.equal(scoped.error.code, "SCOPE_REJECTED");
  }

  const missingPermission = planMcpAuthorize({
    target: { serverId: "filesystem", subjectId: "runtime:agent-1", action: "cache-access" },
    context: { grantedPermissions: ["mcp:auth"] },
  });

  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) {
    assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
  }

  const real = planMcpAuthorize({
    target: { serverId: "filesystem", subjectId: "runtime:agent-1", action: "read-resource" },
    context: { dryRun: false },
  });

  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  }
});
