import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planShellLifecycleManagement,
  shellLifecycleManagementDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellLifecycleManagement.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellLifecycleManagement.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellManagement/shell.shellLifecycleManagement.md",
  testFileUrl: import.meta.url,
});

test("planShellLifecycleManagement creates a guarded shell lifecycle dry-run envelope", () => {
  const result = planShellLifecycleManagement({
    target: {
      action: "create",
      shellType: "zsh",
      workingDirectory: "/tmp/project///",
      idleTimeoutMs: 1000,
    },
    context: {
      invocationId: "lifecycle-1",
      grantedPermissions: ["shell:lifecycle:manage"],
      allowedWorkingDirectories: ["/tmp"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellLifecycleManagementDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.action, "create");
  assert.equal(result.output.sessionId, "lifecycle-1:create:planned-session");
  assert.equal(result.output.shellType, "zsh");
  assert.equal(result.output.workingDirectory, "/tmp/project");
  assert.equal(result.output.plannedState, "planned");
  assert.equal(result.output.lifecycleChangeBlocked, true);
  assert.equal(result.output.resultEnvelope.planned, true);
  assert.deepEqual(result.events, ["basicTool.shell.shellLifecycleManagement.create.dryRun"]);
});

test("planShellLifecycleManagement marks close actions approval-relevant without owning approval policy", () => {
  const close = planShellLifecycleManagement({
    target: {
      action: "close",
      sessionId: "shell-session-1",
    },
    context: { grantedPermissions: ["shell:lifecycle:manage"] },
  });
  assert.equal(close.ok, true);
  if (close.ok) {
    assert.equal(close.output.plannedState, "closed");
    assert.equal(close.output.requiresTapApproval, true);
    assert.equal(close.output.approvalId, undefined);
  }

  const approved = planShellLifecycleManagement({
    target: {
      action: "close",
      sessionId: "shell-session-1",
    },
    context: {
      grantedPermissions: ["shell:lifecycle:manage"],
      approval: { accepted: true, approvalId: "tap-approval-lifecycle" },
    },
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.output.plannedState, "closed");
    assert.equal(approved.output.requiresTapApproval, true);
    assert.equal(approved.output.approvalId, "tap-approval-lifecycle");
  }
});

test("planShellLifecycleManagement rejects missing action, scope, permission, timeout, and real lifecycle changes", () => {
  const missing = planShellLifecycleManagement();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_ACTION");
    assert.equal(missing.error.boundary, "input");
  }

  const noSession = planShellLifecycleManagement({
    target: { action: "attach" },
  });
  assert.equal(noSession.ok, false);
  if (!noSession.ok) {
    assert.equal(noSession.error.code, "MISSING_SESSION_ID");
  }

  const sessionScope = planShellLifecycleManagement({
    target: { action: "resume", sessionId: "outside" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:lifecycle:manage"] },
  });
  assert.equal(sessionScope.ok, false);
  if (!sessionScope.ok) {
    assert.equal(sessionScope.error.code, "SCOPE_REJECTED");
    assert.equal(sessionScope.error.boundary, "scope");
  }

  const directoryScope = planShellLifecycleManagement({
    target: { action: "create", workingDirectory: "/srv/app" },
    context: { allowedWorkingDirectories: ["/tmp"], grantedPermissions: ["shell:lifecycle:manage"] },
  });
  assert.equal(directoryScope.ok, false);
  if (!directoryScope.ok) {
    assert.equal(directoryScope.error.code, "SCOPE_REJECTED");
    assert.equal(directoryScope.error.boundary, "scope");
  }

  const permission = planShellLifecycleManagement({
    target: { action: "create" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const timeout = planShellLifecycleManagement({
    target: { action: "create", idleTimeoutMs: 0 },
  });
  assert.equal(timeout.ok, false);
  if (!timeout.ok) {
    assert.equal(timeout.error.code, "INVALID_TIMEOUT");
    assert.equal(timeout.error.boundary, "resource");
  }

  const real = planShellLifecycleManagement({
    target: { action: "create" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_LIFECYCLE_CHANGE_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});

test("planShellLifecycleManagement returns public-safe errors for malformed runtime JSON shapes", () => {
  const malformedCases = [
    {
      request: { target: { action: "attach", sessionId: 1 } },
      code: "INVALID_SESSION_ID",
    },
    {
      request: { target: { action: "create", workingDirectory: 1 } },
      code: "INVALID_WORKING_DIRECTORY",
    },
    {
      request: { target: { action: "create", idleTimeoutMs: "fast" } },
      code: "INVALID_TIMEOUT",
    },
    {
      request: {
        target: { action: "create" },
        context: { invocationId: 1, grantedPermissions: {}, auditMetadata: 1 },
      },
      code: "PERMISSION_DENIED",
    },
  ];

  for (const { request, code } of malformedCases) {
    const result = planShellLifecycleManagement(request as unknown as Parameters<typeof planShellLifecycleManagement>[0]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, code);
      assert.equal(result.error.publicSafe, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});
