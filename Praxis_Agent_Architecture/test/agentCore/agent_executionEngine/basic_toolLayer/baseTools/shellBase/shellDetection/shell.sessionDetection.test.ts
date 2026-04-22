import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  detectShellSession,
  shellSessionDetectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.md",
  testFileUrl: import.meta.url,
});

test("detectShellSession returns a guarded dry-run session detection envelope", () => {
  const result = detectShellSession({
    target: {
      sessionId: " session-1 ",
      processId: 4242,
      tty: " /dev/pts/3 ",
      shellExecutable: "/bin/zsh",
    },
    context: {
      invocationId: " detect-session ",
      allowedSessionIds: ["session-1"],
      allowedProcessIds: [4242],
      grantedPermissions: ["shell:session:detect", "shell:process:read"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.sessionDetection");
  assert.equal(result.output.target.sessionId, "session-1");
  assert.equal(result.output.target.tty, "/dev/pts/3");
  assert.equal(result.output.detected.sessionKind, "interactive");
  assert.equal(result.output.detected.interactive, true);
  assert.equal(result.output.detected.shellKind, "zsh");
  assert.deepEqual(result.output.permissionsRequired, ["shell:session:detect", "shell:process:read"]);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(shellSessionDetectionDescriptor.unsafeSideEffects, false);
});

test("detectShellSession rejects missing target and invalid identifiers with public-safe errors", () => {
  const missing = detectShellSession();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing session target should fail");
  }
  assert.equal(missing.error.code, "MISSING_SESSION_TARGET");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.publicSafe, true);

  const invalidProcess = detectShellSession({ target: { processId: 0 } });
  assert.equal(invalidProcess.ok, false);
  if (invalidProcess.ok) {
    assert.fail("invalid process id should fail");
  }
  assert.equal(invalidProcess.error.code, "INVALID_PROCESS_ID");

  const invalidSession = detectShellSession({ target: { sessionId: "   " } });
  assert.equal(invalidSession.ok, false);
  if (invalidSession.ok) {
    assert.fail("blank session id should fail");
  }
  assert.equal(invalidSession.error.code, "INVALID_SESSION_ID");
});

test("detectShellSession enforces scope, permissions, and dry-run boundary", () => {
  const outOfScope = detectShellSession({
    target: { sessionId: "session-2", processId: 4242 },
    context: {
      allowedSessionIds: ["session-1"],
      allowedProcessIds: [4242],
    },
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("out-of-scope session should fail");
  }
  assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const missingPermission = detectShellSession({
    target: { processId: 4242 },
    context: { grantedPermissions: ["shell:session:detect"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("process-backed detection should require shell:process:read");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realDetection = detectShellSession({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false },
  });

  assert.equal(realDetection.ok, false);
  if (realDetection.ok) {
    assert.fail("real session detection should be blocked");
  }
  assert.equal(realDetection.error.code, "REAL_DETECTION_BLOCKED");
});
