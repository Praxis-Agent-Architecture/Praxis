import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  planShellPromptHandling,
  shellPromptHandlingDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.promptHandling.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.promptHandling.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.promptHandling.md",
  testFileUrl: import.meta.url,
});

test("planShellPromptHandling creates an observable prompt handling dry-run envelope", () => {
  const result = planShellPromptHandling({
    target: {
      sessionId: "shell-session-1",
      promptText: "Continue? [y/N]",
      action: "respond",
      responseText: "y\n",
      options: ["y", "n"],
    },
    context: {
      invocationId: "prompt-1",
      grantedPermissions: ["shell:prompt:handle"],
      allowedSessionIds: ["shell-session-1"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellPromptHandlingDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.promptKind, "confirmation");
  assert.equal(result.output.action, "respond");
  assert.equal(result.output.responsePreview, "y\n");
  assert.equal(result.output.responseBytes, Buffer.byteLength("y\n", "utf8"));
  assert.deepEqual(result.output.options, ["y", "n"]);
  assert.equal(result.output.stdinWriteBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.deepEqual(result.events, ["basicTool.shell.promptHandling.respond.dryRun"]);
});

test("planShellPromptHandling requires approval and redacts sensitive prompt responses", () => {
  const rejected = planShellPromptHandling({
    target: {
      sessionId: "shell-session-1",
      promptText: "sudo password:",
      action: "respond",
      responseText: "secret",
    },
    context: { grantedPermissions: ["shell:prompt:handle"] },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "APPROVAL_REQUIRED");
    assert.equal(rejected.error.boundary, "approval");
  }

  const approved = planShellPromptHandling({
    target: {
      sessionId: "shell-session-1",
      promptText: "sudo password:",
      action: "respond",
      responseText: "secret",
    },
    context: {
      grantedPermissions: ["shell:prompt:handle"],
      approval: { accepted: true, approvalId: "tap-approval-1" },
    },
  });
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.output.promptKind, "sudo");
    assert.equal(approved.output.responsePreview, "[redacted]");
    assert.equal(approved.output.requiresTapApproval, true);
    assert.equal(approved.output.approvalId, "tap-approval-1");
  }
});

test("planShellPromptHandling rejects missing input, scope, permission, and real handling", () => {
  const missing = planShellPromptHandling();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SESSION_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noPrompt = planShellPromptHandling({
    target: { sessionId: "shell-session-1", action: "observe" },
  });
  assert.equal(noPrompt.ok, false);
  if (!noPrompt.ok) {
    assert.equal(noPrompt.error.code, "MISSING_PROMPT_TEXT");
  }

  const scope = planShellPromptHandling({
    target: { sessionId: "outside", promptText: "Name:", action: "observe" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:prompt:handle"] },
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
    assert.equal(scope.error.boundary, "scope");
  }

  const permission = planShellPromptHandling({
    target: { sessionId: "inside", promptText: "Name:", action: "observe" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const real = planShellPromptHandling({
    target: { sessionId: "inside", promptText: "Name:", action: "observe" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_PROMPT_HANDLING_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
