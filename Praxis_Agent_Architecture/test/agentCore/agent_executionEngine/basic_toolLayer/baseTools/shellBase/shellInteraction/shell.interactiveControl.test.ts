import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planShellInteractiveControl,
  shellInteractiveControlDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.interactiveControl.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.interactiveControl.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.interactiveControl.md",
  testFileUrl: import.meta.url,
});

test("planShellInteractiveControl creates a blocked dry-run send-input envelope", () => {
  const result = planShellInteractiveControl({
    target: { sessionId: "shell-session-1", action: "send-input", input: "npm test\n" },
    context: {
      invocationId: "interactive-1",
      grantedPermissions: ["shell:interactive:control"],
      allowedSessionIds: ["shell-session-1"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellInteractiveControlDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.target.action, "send-input");
  assert.equal(result.output.target.inputPreview, "npm test\n");
  assert.equal(result.output.target.inputBytes, Buffer.byteLength("npm test\n"));
  assert.equal(result.output.controlBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.deepEqual(result.events, ["basicTool.shell.interactiveControl.send-input.dryRun"]);
});

test("planShellInteractiveControl requires approval for interrupt and terminate actions", () => {
  const interrupt = planShellInteractiveControl({
    target: { sessionId: "shell-session-1", action: "interrupt" },
    context: { grantedPermissions: ["shell:interactive:control"] },
  });
  assert.equal(interrupt.ok, false);
  if (!interrupt.ok) {
    assert.equal(interrupt.error.code, "APPROVAL_REQUIRED");
    assert.equal(interrupt.error.boundary, "approval");
  }

  const approved = planShellInteractiveControl({
    target: { sessionId: "shell-session-1", action: "terminate" },
    context: {
      grantedPermissions: ["shell:interactive:control"],
      approval: { accepted: true, approvalId: "tap-approval-1" },
    },
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.output.requiresTapApproval, true);
    assert.equal(approved.output.approvalId, "tap-approval-1");
    assert.equal(approved.output.target.signal, "SIGTERM");
  }
});

test("planShellInteractiveControl rejects missing input, scope, permission, and real control", () => {
  const missing = planShellInteractiveControl();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SESSION_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noInput = planShellInteractiveControl({
    target: { sessionId: "shell-session-1", action: "send-input" },
  });
  assert.equal(noInput.ok, false);
  if (!noInput.ok) {
    assert.equal(noInput.error.code, "MISSING_INPUT");
  }

  const scope = planShellInteractiveControl({
    target: { sessionId: "outside", action: "resume" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:interactive:control"] },
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
    assert.equal(scope.error.boundary, "scope");
  }

  const permission = planShellInteractiveControl({
    target: { sessionId: "inside", action: "resume" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const real = planShellInteractiveControl({
    target: { sessionId: "inside", action: "resume" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_CONTROL_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
