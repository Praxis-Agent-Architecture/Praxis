import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  detectShellSession,
  executeShellSessionDetection,
  shellSessionDetectionHandler,
  shellSessionDetectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeShellSessionDetection as executeShellSessionDetectionBestPractice } from "../../../../../../../src/storagePool/baseToolStorage/shellBase/shellDetection/shell.sessionDetection/bestPractice.js";

type ShellSessionExecutionResult = Awaited<ReturnType<typeof executeShellSessionDetection>>;

async function assertSessionInputError(
  operation: Promise<ShellSessionExecutionResult>,
  code = "MISSING_SESSION_TARGET",
): Promise<void> {
  await assert.doesNotReject(operation);
  const result = await operation;
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("shell.sessionDetection malformed request should fail");
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
}

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.md",
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
  assert.equal(result.output.detectionEnvelope.realProcessReadRequired, false);
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

test("detectShellSession ignores malformed optional hints without treating them as approval facts", () => {
  const result = detectShellSession({
    target: { shellExecutable: "/bin/bash", knownInteractive: "yes" } as never,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("malformed optional hints should still produce a dry-run session report");
  }
  assert.equal(result.output.target.knownInteractive, undefined);
  assert.equal(result.output.detected.interactive, "unknown");
  assert.equal(result.output.detectionEnvelope.realProcessReadRequired, false);
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

test("executeShellSessionDetection keeps dry-run provider-free and gates real detection", async () => {
  let providerCalled = false;
  const dryRun = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/bash" },
    provider: () => {
      providerCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(dryRun.ok, true);
  assert.equal(providerCalled, false);

  const denied = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false },
    provider: () => {
      providerCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "GOVERNANCE_REJECTED");
  }
});

test("executeShellSessionDetection returns stable provider errors without leaking provider details", async () => {
  const missingProvider = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false, guard: { allowed: true } },
  });

  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const rejected = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("SESSION_SECRET=token-value");
    },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.sessionDetection provider rejected the detection");
    assert.doesNotMatch(JSON.stringify(rejected), /SESSION_SECRET|token-value/u);
  }
});

test("executeShellSessionDetection rejects null and non-object requests as public-safe input errors", async () => {
  await assertSessionInputError(executeShellSessionDetection(null as never));
  await assertSessionInputError(executeShellSessionDetection(1 as never));
  await assertSessionInputError(executeShellSessionDetection("bad" as never));
  await assertSessionInputError(executeShellSessionDetection([] as never));
});

test("shell session best-practice wrapper rejects null and non-object requests as public-safe input errors", async () => {
  await assertSessionInputError(executeShellSessionDetectionBestPractice(null as never));
  await assertSessionInputError(executeShellSessionDetectionBestPractice(1 as never));
  await assertSessionInputError(executeShellSessionDetectionBestPractice("bad" as never));
  await assertSessionInputError(executeShellSessionDetectionBestPractice([] as never));
});

test("executeShellSessionDetection intercepts malformed real targets before provider dispatch", async () => {
  let providerCalls = 0;
  const result = await executeShellSessionDetection({
    target: { processId: "bad" } as never,
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_PROCESS_ID");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellSessionDetection rejects unsafe shell executable and malformed guard reason before provider dispatch", async () => {
  let providerCalls = 0;
  const unsafeExecutable = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/sh\nbad" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(unsafeExecutable.ok, false);
  if (!unsafeExecutable.ok) {
    assert.equal(unsafeExecutable.error.code, "INVALID_SHELL_EXECUTABLE");
    assert.equal(unsafeExecutable.error.safeForRuntimeInspection, true);
  }
  assert.equal(providerCalls, 0);

  const malformedReason = await executeShellSessionDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false, guard: { reason: { secret: "TOKEN=abc" } } } as never,
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(malformedReason.ok, false);
  if (!malformedReason.ok) {
    assert.equal(malformedReason.error.code, "GOVERNANCE_REJECTED");
    assert.equal(malformedReason.error.message, "shell.sessionDetection requires an affirmative runtime guard for real detection");
    assert.doesNotMatch(JSON.stringify(malformedReason), /TOKEN=abc/u);
  }
  assert.equal(providerCalls, 0);
});

test("shellSessionDetectionHandler and registry invoke a runtime-supplied executor", async () => {
  const result = await shellSessionDetectionHandler.invoke({
    toolCallId: "session-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/bash", tty: "/dev/pts/1" },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: {
            exitCode: 0,
            stdout: "pid=1234\nppid=1000\ntty=/dev/pts/1\nflags=himBH\nshell=bash\n",
            stderr: "",
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.equal(result.output.detected.interactive, true);
    assert.equal(result.output.detected.shellKind, "bash");
    assert.equal(result.output.target.processId, 1234);
  }

  const lookup = createBaseToolRegistry().lookupHandler("shell.sessionDetection");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    assert.fail("shell.sessionDetection handler should be registered");
  }

  const registryResult = await lookup.handler.invoke({
    toolCallId: "registry-session-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/bash" },
      context: { auditMetadata: ["SECRET_VALUE"] as never },
    },
    executor: {},
  });

  assert.equal(registryResult.ok, true);
  if (registryResult.ok) {
    const output = registryResult.output as { detected: { shellKind: string }; executionBlocked: boolean };
    assert.equal(output.detected.shellKind, "bash");
    assert.equal(output.executionBlocked, true);
    assert.doesNotMatch(JSON.stringify(registryResult), /SECRET_VALUE/u);
  }
});

test("shellSessionDetectionHandler maps runtime executor failures to public-safe provider errors", async () => {
  const result = await shellSessionDetectionHandler.invoke({
    toolCallId: "session-failure-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/bash" },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: false,
          error: {
            code: "SESSION_SECRET",
            message: "SESSION_SECRET=token-value",
            publicSafe: true,
          },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(JSON.stringify(result), /SESSION_SECRET|token-value/u);
  }
});

test("detectShellSession returns public-safe errors for malformed runtime JSON", () => {
  const malformed = detectShellSession({
    target: { processId: "abc", sessionId: 1 } as never,
  });

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "INVALID_PROCESS_ID");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
  }
});
