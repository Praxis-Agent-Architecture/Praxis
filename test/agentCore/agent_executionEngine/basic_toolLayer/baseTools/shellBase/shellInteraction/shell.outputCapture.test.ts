import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  captureShellOutput,
  shellOutputCaptureDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.outputCapture.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.outputCapture.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellInteraction/shell.outputCapture.md",
  testFileUrl: import.meta.url,
});

test("captureShellOutput captures supplied chunks with redaction and byte limits", () => {
  const result = captureShellOutput({
    target: {
      sessionId: "shell-session-1",
      streams: ["stdout"],
      maxBytes: 24,
      chunks: [
        { stream: "stdout", text: "token=secret\n", receivedAtMs: 100 },
        { stream: "stderr", text: "ignored\n", receivedAtMs: 110 },
        { stream: "stdout", text: "tail output", receivedAtMs: 120 },
      ],
      redactionPatterns: ["secret"],
    },
    context: {
      invocationId: "capture-1",
      grantedPermissions: ["shell:output:capture"],
      allowedSessionIds: ["shell-session-1"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(shellOutputCaptureDescriptor.defaultDryRun, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.output.sessionId, "shell-session-1");
  assert.equal(result.output.realBufferReadBlocked, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.equal(result.output.chunks[0]?.text, "token=[redacted]\n");
  assert.equal(result.output.truncated, true);
  assert.deepEqual(result.events, ["basicTool.shell.outputCapture.truncated"]);
});

test("captureShellOutput returns an empty dry-run envelope when no chunks are supplied", () => {
  const result = captureShellOutput({
    target: { sessionId: "shell-session-1" },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.output.streams, ["stdout", "stderr"]);
    assert.deepEqual(result.output.chunks, []);
    assert.equal(result.output.totalBytes, 0);
    assert.equal(result.output.truncated, false);
  }
});

test("captureShellOutput rejects missing target, invalid stream, permission, scope, and real capture", () => {
  const missing = captureShellOutput();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_SESSION_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const invalidStream = captureShellOutput({
    target: { sessionId: "shell-session-1", streams: ["stdin" as "stdout"] },
  });
  assert.equal(invalidStream.ok, false);
  if (!invalidStream.ok) {
    assert.equal(invalidStream.error.code, "INVALID_STREAM");
  }

  const permission = captureShellOutput({
    target: { sessionId: "shell-session-1" },
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  if (!permission.ok) {
    assert.equal(permission.error.code, "PERMISSION_DENIED");
    assert.equal(permission.error.boundary, "permission");
  }

  const scope = captureShellOutput({
    target: { sessionId: "outside" },
    context: { allowedSessionIds: ["inside"], grantedPermissions: ["shell:output:capture"] },
  });
  assert.equal(scope.ok, false);
  if (!scope.ok) {
    assert.equal(scope.error.code, "SCOPE_REJECTED");
    assert.equal(scope.error.boundary, "scope");
  }

  const real = captureShellOutput({
    target: { sessionId: "inside" },
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  if (!real.ok) {
    assert.equal(real.error.code, "REAL_CAPTURE_BLOCKED");
    assert.equal(real.error.boundary, "contract");
  }
});
