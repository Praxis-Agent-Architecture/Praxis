import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planShellStdinFeeding,
  shellStdinFeedingDescriptor,
} from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.stdinFeeding.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.stdinFeeding.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.stdinFeeding.md",
  testFileUrl: import.meta.url,
});

test("planShellStdinFeeding creates a guarded stdin dry-run envelope", () => {
  const result = planShellStdinFeeding({
    target: {
      sessionId: "shell-session-1",
      input: "ls -la",
      appendNewline: true,
    },
    context: {
      invocationId: "stdin-1",
      grantedPermissions: ["shell:stdin:feed"],
      allowedSessionIds: ["shell-session-1"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellStdinFeedingDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.sessionId, "shell-session-1");
  assert.equal(result.output.mode, "text");
  assert.equal(result.output.appendNewline, true);
  assert.equal(result.output.inputPreview, "ls -la\n");
  assert.equal(result.output.inputBytes, Buffer.byteLength("ls -la\n", "utf8"));
  assert.equal(result.output.stdinWriteBlocked, true);
  assert.equal(result.output.resultEnvelope.planned, true);
  assert.deepEqual(result.events, ["basicTool.shell.stdinFeeding.dryRun"]);
});

test("planShellStdinFeeding requires approval for sensitive or control-sequence input", () => {
  const rejected = planShellStdinFeeding({
    target: {
      sessionId: "shell-session-1",
      input: "secret",
      sensitive: true,
    },
    context: { grantedPermissions: ["shell:stdin:feed"] },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "APPROVAL_REQUIRED");
    assert.equal(rejected.error.boundary, "approval");
  }

  const approved = planShellStdinFeeding({
    target: {
      sessionId: "shell-session-1",
      input: "\u0003",
      mode: "control-sequence",
    },
    context: {
      grantedPermissions: ["shell:stdin:feed"],
      approval: { accepted: true, approvalId: "tap-approval-stdin" },
    },
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.output.mode, "control-sequence");
    assert.equal(approved.output.requiresTapApproval, true);
    assert.equal(approved.output.approvalId, "tap-approval-stdin");
  }
});

test("planShellStdinFeeding rejects missing input, scope, permission, size, and real writes", () => {
  const missing = planShellStdinFeeding();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SESSION_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noInput = planShellStdinFeeding({
    target: { sessionId: "shell-session-1" },
  });
  assert.equal(noInput.ok, false);
  if (!noInput.ok) {
    assert.equal(noInput.error.code, "MISSING_INPUT");
  }

  const scope = planShellStdinFeeding({
    target: { sessionId: "outside", input: "echo ok" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:stdin:feed"] },
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
    assert.equal(scope.error.boundary, "scope");
  }

  const permission = planShellStdinFeeding({
    target: { sessionId: "inside", input: "echo ok" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const tooLarge = planShellStdinFeeding({
    target: { sessionId: "inside", input: "abcd" },
    context: { maxBytes: 3 },
  });
  assert.equal(tooLarge.ok, false);
  if (!tooLarge.ok) {
    assert.equal(tooLarge.error.code, "INPUT_TOO_LARGE");
    assert.equal(tooLarge.error.boundary, "resource");
  }

  const real = planShellStdinFeeding({
    target: { sessionId: "inside", input: "echo ok" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_STDIN_WRITE_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
