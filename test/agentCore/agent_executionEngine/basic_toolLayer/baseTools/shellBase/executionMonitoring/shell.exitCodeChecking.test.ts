import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  checkShellExitCode,
  executeShellExitCodeChecking,
  shellExitCodeCheckingHandler,
  shellExitCodeCheckingDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/executionMonitoring/shell.exitCodeChecking.md",
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

test("executeShellExitCodeChecking uses a guarded provider for real observations", async () => {
  const result = await executeShellExitCodeChecking({
    executionId: "exec-provider",
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    provider: (request) => {
      assert.equal(request.executionId, "exec-provider");
      return { exitCode: 3 };
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.equal(result.output.providerCalled, true);
    assert.equal(result.output.status, "failed");
  }
});

test("executeShellExitCodeChecking never calls a provider during dry-run", async () => {
  let providerCalled = false;
  const result = await executeShellExitCodeChecking({
    executionId: "exec-dry-provider",
    exitCode: 0,
    context: { guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
    provider: () => {
      providerCalled = true;
      throw new Error("provider must not be called during dry-run");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalled, false);
  if (result.ok) {
    assert.equal(result.output.dryRun, true);
    assert.equal(result.output.providerCalled, false);
  }
});

test("executeShellExitCodeChecking validates caller exit material before provider dispatch", async () => {
  for (const [name, input, expectedCode] of [
    ["bad-exit-code", { exitCode: {} }, "INVALID_EXIT_CODE"],
    ["bad-timeout", { timedOut: {} }, "INVALID_ARGUMENT"],
  ] as const) {
    let providerCalled = false;
    const result = await executeShellExitCodeChecking({
      executionId: `exec-real-${name}`,
      ...input,
      context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["shell:observe"] },
      provider: () => {
        providerCalled = true;
        return { exitCode: 0 };
      },
    } as never);

    assert.equal(result.ok, false);
    assert.equal(providerCalled, false);
    if (!result.ok) {
      assert.equal(result.error.code, expectedCode);
      assert.equal(result.error.safeForRuntimeInspection, true);
      assert.equal(result.error.internalDetailExposed, false);
    }
  }
});

test("executeShellExitCodeChecking rejects missing provider and denied governance", async () => {
  const denied = await executeShellExitCodeChecking({
    executionId: "exec-denied",
    context: { dryRun: false, guard: { allowed: false } },
    provider: () => ({ exitCode: 0 }),
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error.code, "GOVERNANCE_REJECTED");

  const missingProvider = await executeShellExitCodeChecking({
    executionId: "exec-missing-provider",
    context: { dryRun: false, guard: { allowed: true } },
  });
  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
});

test("executeShellExitCodeChecking maps provider failures and malformed runtime material safely", async () => {
  const rejected = await executeShellExitCodeChecking({
    executionId: "exec-provider-fails",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      throw new Error("internal monitor stack");
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.exitCodeChecking provider rejected the request");
    assert.equal(rejected.error.safeForRuntimeInspection, true);
  }

  const malformedExit = await executeShellExitCodeChecking({
    executionId: "exec-provider-malformed",
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => ({ exitCode: "bad" as never }),
  });
  assert.equal(malformedExit.ok, false);
  if (!malformedExit.ok) assert.equal(malformedExit.error.code, "INVALID_EXIT_CODE");

  const malformedTimedOut = await executeShellExitCodeChecking({
    executionId: "exec-provider-bad-timeout",
    context: { dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { observation: { exitCode: 0, timedOut: "yes" } } }),
      },
    },
  });
  assert.equal(malformedTimedOut.ok, false);
  if (!malformedTimedOut.ok) assert.equal(malformedTimedOut.error.code, "INVALID_ARGUMENT");
});

test("shellExitCodeCheckingHandler and registry invoke through the runtime monitor provider", async () => {
  const direct = await shellExitCodeCheckingHandler.invoke({
    toolCallId: "call-exit",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-handler", context: { dryRun: false, guard: { accepted: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { exitCode: 0 } }),
      },
    },
  });
  assert.equal(direct.ok, true);
  if (direct.ok) assert.equal(direct.output.providerCalled, true);

  const registryHandler = createBaseToolRegistry().lookupHandler("shell.exitCodeChecking");
  assert.equal(registryHandler.ok, true);
  if (!registryHandler.ok) return;
  const throughRegistry = await registryHandler.handler.invoke({
    toolCallId: "call-exit-registry",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: { executionId: "exec-registry", context: { dryRun: false, guard: { allowed: true } } },
    executor: {
      shell: {
        monitorExecution: async () => ({ ok: true, output: { exitCode: 0 } }),
      },
    },
  });
  assert.equal(throughRegistry.ok, true);
});

test("checkShellExitCode returns public-safe errors for malformed runtime JSON", () => {
  const malformedRuntime = checkShellExitCode({ executionId: 1, exitCode: 0 } as never);
  assert.equal(malformedRuntime.ok, false);
  if (!malformedRuntime.ok) assert.equal(malformedRuntime.error.code, "MISSING_EXECUTION_ID");

  const malformedPolicy = checkShellExitCode({ executionId: "exec-malformed", exitCode: 0, policy: { allowedExitCodes: {} } } as never);
  assert.equal(malformedPolicy.ok, false);
  if (!malformedPolicy.ok) assert.equal(malformedPolicy.error.code, "INVALID_ALLOWED_EXIT_CODE");

  const malformedSignal = checkShellExitCode({ executionId: "exec-signal", signal: 9 } as never);
  assert.equal(malformedSignal.ok, false);
  if (!malformedSignal.ok) assert.equal(malformedSignal.error.code, "INVALID_SIGNAL");

  const malformedRuntimeId = checkShellExitCode({ executionId: "exec-context", exitCode: 0, context: { runtimeId: 1 } } as never);
  assert.equal(malformedRuntimeId.ok, true);
});
