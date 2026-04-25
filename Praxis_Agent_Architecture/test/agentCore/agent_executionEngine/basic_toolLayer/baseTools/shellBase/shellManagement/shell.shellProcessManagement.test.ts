import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planShellProcessManagement,
  shellProcessManagementDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellProcessManagement.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellProcessManagement.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellProcessManagement.md",
  testFileUrl: import.meta.url,
});

test("planShellProcessManagement creates a guarded process inspection dry-run envelope", () => {
  const result = planShellProcessManagement({
    target: {
      action: "inspect",
      sessionId: "shell-session-1",
      processId: 1234,
      reason: "status check",
    },
    context: {
      invocationId: "process-1",
      grantedPermissions: ["shell:process:manage"],
      allowedSessionIds: ["shell-session-1"],
      allowedProcessIds: [1234],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellProcessManagementDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.action, "inspect");
  assert.equal(result.output.sessionId, "shell-session-1");
  assert.equal(result.output.processId, 1234);
  assert.equal(result.output.reason, "status check");
  assert.equal(result.output.processChangeBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.resultEnvelope.observedStatus, "unknown");
  assert.deepEqual(result.events, ["basicTool.shell.shellProcessManagement.inspect.dryRun"]);
});

test("planShellProcessManagement marks destructive process changes approval-relevant without owning approval policy", () => {
  const signaled = planShellProcessManagement({
    target: {
      action: "signal",
      processId: 1234,
      signal: "SIGKILL",
    },
    context: { grantedPermissions: ["shell:process:manage"] },
  });
  assert.equal(signaled.ok, true);
  if (signaled.ok) {
    assert.equal(signaled.output.action, "signal");
    assert.equal(signaled.output.requiresTapApproval, true);
    assert.equal(signaled.output.approvalId, undefined);
  }

  const approved = planShellProcessManagement({
    target: {
      action: "reap",
      processId: 1234,
    },
    context: {
      grantedPermissions: ["shell:process:manage"],
      approval: { accepted: true, approvalId: "tap-approval-process" },
    },
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.output.action, "reap");
    assert.equal(approved.output.requiresTapApproval, true);
    assert.equal(approved.output.approvalId, "tap-approval-process");
  }
});

test("planShellProcessManagement rejects missing references, scope, permission, priority, and real changes", () => {
  const missing = planShellProcessManagement();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_ACTION");
    assert.equal(missing.error.boundary, "input");
  }

  const noReference = planShellProcessManagement({
    target: { action: "inspect" },
  });
  assert.equal(noReference.ok, false);
  if (!noReference.ok) {
    assert.equal(noReference.error.code, "MISSING_PROCESS_REFERENCE");
  }

  const invalidSignal = planShellProcessManagement({
    target: { action: "signal", processId: 1234 },
  });
  assert.equal(invalidSignal.ok, false);
  if (!invalidSignal.ok) {
    assert.equal(invalidSignal.error.code, "MISSING_SIGNAL");
  }

  const sessionScope = planShellProcessManagement({
    target: { action: "inspect", sessionId: "outside" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:process:manage"] },
  });
  assert.equal(sessionScope.ok, false);
  if (!sessionScope.ok) {
    assert.equal(sessionScope.error.code, "SCOPE_REJECTED");
    assert.equal(sessionScope.error.boundary, "scope");
  }

  const processScope = planShellProcessManagement({
    target: { action: "inspect", processId: 1234 },
    context: { allowedProcessIds: [5678], grantedPermissions: ["shell:process:manage"] },
  });
  assert.equal(processScope.ok, false);
  if (!processScope.ok) {
    assert.equal(processScope.error.code, "SCOPE_REJECTED");
    assert.equal(processScope.error.boundary, "scope");
  }

  const permission = planShellProcessManagement({
    target: { action: "inspect", processId: 1234 },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const priority = planShellProcessManagement({
    target: { action: "prioritize", processId: 1234, priority: 20 },
  });
  assert.equal(priority.ok, false);
  if (!priority.ok) {
    assert.equal(priority.error.code, "INVALID_PRIORITY");
    assert.equal(priority.error.boundary, "resource");
  }

  const real = planShellProcessManagement({
    target: { action: "inspect", processId: 1234 },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_PROCESS_CHANGE_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planShellProcessManagement returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedCases = [
    {
      request: { target: { action: "inspect", sessionId: 1 } },
      code: "INVALID_SESSION_ID",
    },
    {
      request: { target: { action: "inspect", processId: "1234" } },
      code: "INVALID_PROCESS_ID",
    },
    {
      request: { target: { action: "signal", processId: 1234, signal: {} } },
      code: "INVALID_SIGNAL",
    },
    {
      request: {
        target: { action: "inspect", processId: 1234, reason: 1 },
        context: { invocationId: 1, grantedPermissions: {}, allowedProcessIds: { length: 1 }, auditMetadata: 1 },
      },
      code: "PERMISSION_DENIED",
    },
    {
      request: {
        target: { action: "inspect", processId: 1234, priority: "high" },
        context: { grantedPermissions: ["shell:process:manage"] },
      },
      code: "INVALID_PRIORITY",
    },
  ];

  for (const { request, code } of malformedCases) {
    const result = planShellProcessManagement(request as unknown as Parameters<typeof planShellProcessManagement>[0]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, code);
      assert.equal(result.error.publicSafe, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});
