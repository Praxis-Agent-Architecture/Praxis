import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  checkShellExitCode,
  shellExitCodeCheckingDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.md",
  testFileUrl: import.meta.url,
});

test("checkShellExitCode classifies a successful audited dry-run exit observation", () => {
  const result = checkShellExitCode({
    executionId: "exec-1",
    command: "pwd",
    exitCode: 0,
    context: { invocationId: "exit-1", grantedPermissions: ["shell:observe"] },
  });

  assert.equal(result.ok, true);
  assert.equal(shellExitCodeCheckingDescriptor.defaultDryRun, true);
  assert.equal(result.output.status, "success");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionObservedOnly, true);
  assert.equal(result.output.unsafeSideEffects, false);
  assert.deepEqual(result.events, ["basicTool.shell.exitCodeChecking.success"]);
});

test("checkShellExitCode distinguishes allowed failures, failed exits, and terminations", () => {
  const allowed = checkShellExitCode({
    executionId: "exec-allowed",
    exitCode: 2,
    policy: { allowedExitCodes: [0, 2] },
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.output.status, "allowed-failure");

  const failed = checkShellExitCode({
    executionId: "exec-failed",
    exitCode: 127,
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.output.status, "failed");

  const terminated = checkShellExitCode({
    executionId: "exec-term",
    signal: "SIGTERM",
    context: { grantedPermissions: ["shell:observe"] },
  });
  assert.equal(terminated.ok, true);
  assert.equal(terminated.output.status, "terminated");
});

test("checkShellExitCode rejects missing observations, invalid exit codes, missing permission, and real execution", () => {
  const missing = checkShellExitCode();
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, "MISSING_EXECUTION_ID");

  const noObservation = checkShellExitCode({ executionId: "exec-empty" });
  assert.equal(noObservation.ok, false);
  assert.equal(noObservation.error.code, "MISSING_EXIT_OBSERVATION");

  const invalid = checkShellExitCode({ executionId: "exec-invalid", exitCode: 999 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_EXIT_CODE");

  const permission = checkShellExitCode({
    executionId: "exec-permission",
    exitCode: 0,
    context: { grantedPermissions: [] },
  });
  assert.equal(permission.ok, false);
  assert.equal(permission.error.code, "PERMISSION_DENIED");

  const real = checkShellExitCode({
    executionId: "exec-real",
    exitCode: 0,
    context: { dryRun: false },
  });
  assert.equal(real.ok, false);
  assert.equal(real.error.code, "REAL_EXECUTION_BLOCKED");
  assert.equal(real.error.boundary, "contract");
});
