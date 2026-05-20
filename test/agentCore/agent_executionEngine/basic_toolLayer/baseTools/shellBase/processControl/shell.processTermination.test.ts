import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  planShellProcessTermination,
  shellProcessTerminationDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processTermination.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processTermination.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processTermination.md",
  testFileUrl: import.meta.url,
});

test("planShellProcessTermination returns a guarded dry-run termination envelope", () => {
  const result = planShellProcessTermination({
    target: {
      processId: 4242,
      signal: "SIGINT",
      reason: "stop stale shell command",
    },
    context: {
      invocationId: " invoke-shell-stop ",
      allowedProcessIds: [4242],
      grantedPermissions: ["shell:process:terminate", "shell:process:signal"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.processTermination");
  assert.equal(result.output.target.processId, 4242);
  assert.equal(result.output.terminationEnvelope.signal, "SIGINT");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.unsafeSideEffects, true);
  assert.equal(shellProcessTerminationDescriptor.unsafeSideEffects, true);
});

test("planShellProcessTermination rejects empty and invalid process ids with public-safe errors", () => {
  const missing = planShellProcessTermination();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing process id should fail");
  }
  assert.equal(missing.error.code, "MISSING_PROCESS_ID");
  assert.equal(missing.error.boundary, "input");
  assert.equal(missing.error.publicSafe, true);

  const invalid = planShellProcessTermination({ target: { processId: -1 } });
  assert.equal(invalid.ok, false);
  if (invalid.ok) {
    assert.fail("invalid process id should fail");
  }
  assert.equal(invalid.error.code, "INVALID_PROCESS_ID");
});

test("planShellProcessTermination keeps forceful real side effects behind approval and dry-run guards", () => {
  const approvalRequired = planShellProcessTermination({
    target: { processId: 4242, force: true },
    context: {
      grantedPermissions: ["shell:process:terminate", "shell:process:signal", "shell:process:force"],
    },
  });

  assert.equal(approvalRequired.ok, false);
  if (approvalRequired.ok) {
    assert.fail("forceful termination should require approval");
  }
  assert.equal(approvalRequired.error.code, "APPROVAL_REQUIRED");

  const missingPermission = planShellProcessTermination({
    target: { processId: 4242, signal: "SIGKILL" },
    context: {
      approval: { accepted: true },
      grantedPermissions: ["shell:process:terminate"],
    },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("SIGKILL should require force and signal permissions");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realExecution = planShellProcessTermination({
    target: { processId: 4242 },
    context: { dryRun: false },
  });

  assert.equal(realExecution.ok, false);
  if (realExecution.ok) {
    assert.fail("real process termination should be blocked");
  }
  assert.equal(realExecution.error.code, "REAL_EXECUTION_BLOCKED");
});
