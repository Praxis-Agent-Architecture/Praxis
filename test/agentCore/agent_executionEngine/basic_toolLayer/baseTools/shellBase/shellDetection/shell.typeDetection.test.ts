import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  detectShellType,
  executeShellTypeDetection,
  shellTypeDetectionHandler,
  shellTypeDetectionDescriptor,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeShellTypeDetection as executeShellTypeDetectionBestPractice } from "../../../../../../../src/storagePool/baseToolStorage/shellBase/shellDetection/shell.typeDetection/bestPractice.js";

type ShellTypeExecutionResult = Awaited<ReturnType<typeof executeShellTypeDetection>>;

async function assertTypeInputError(
  operation: Promise<ShellTypeExecutionResult>,
  code = "MISSING_RUNTIME_ID",
): Promise<void> {
  await assert.doesNotReject(operation);
  const result = await operation;
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("shell.typeDetection malformed request should fail");
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
}

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.md",
  testFileUrl: import.meta.url,
});

test("detectShellType classifies supplied shell hints without probing the host", () => {
  const result = detectShellType({
    context: {
      runtimeId: "runtime-1",
      invocationId: "detect-1",
      requestedScopes: ["tool.shell.detect"],
      allowedScopes: ["tool.shell.detect"],
    },
    shellPath: "/usr/bin/zsh",
    platform: "linux",
  });

  assert.equal(result.ok, true);
  assert.equal(shellTypeDetectionDescriptor.defaultDispatch, "dry-run");
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.toolId, "shell.typeDetection");
  assert.equal(result.report.detectedType, "zsh");
  assert.equal(result.report.confidence, "high");
  assert.equal(result.report.normalizedShellName, "zsh");
  assert.equal(result.report.source, "shellPath");
  assert.equal(result.report.dryRun, true);
  assert.equal(result.report.unsafeSideEffects, false);
  assert.deepEqual(result.report.acceptedScopes, ["tool.shell.detect"]);
});

test("detectShellType reports unknown shells as a safe low-confidence result", () => {
  const result = detectShellType({
    context: { runtimeId: "runtime-1" },
    executableName: "custom-shell",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.report.detectedType, "unknown");
  assert.equal(result.report.confidence, "low");
});

test("detectShellType classifies missing input, scope denial, and real probe attempts", () => {
  const missing = detectShellType();
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.error.code, "MISSING_RUNTIME_ID");
    assert.equal(missing.error.boundary, "input");
  }

  const noHint = detectShellType({ context: { runtimeId: "runtime-1" } });
  assert.equal(noHint.ok, false);
  if (!noHint.ok) {
    assert.equal(noHint.error.code, "MISSING_SHELL_HINT");
    assert.equal(noHint.error.boundary, "input");
  }

  const denied = detectShellType({
    context: {
      runtimeId: "runtime-1",
      requestedScopes: ["tool.shell.detect", "host.env.read"],
      allowedScopes: ["tool.shell.detect"],
    },
    envShell: "/bin/bash",
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) {
    assert.equal(denied.error.code, "SCOPE_DENIED");
    assert.equal(denied.error.boundary, "scope");
  }

  const realProbe = detectShellType({
    context: { runtimeId: "runtime-1", dryRun: false },
    shellPath: "/bin/bash",
  });
  assert.equal(realProbe.ok, false);
  if (!realProbe.ok) {
    assert.equal(realProbe.error.code, "REAL_SHELL_PROBE_NOT_ALLOWED");
    assert.equal(realProbe.error.boundary, "contract");
  }
});

test("detectShellType treats malformed hints and metadata as public-safe JSON boundary inputs", () => {
  const malformedHints = detectShellType({
    context: { runtimeId: "runtime-1" },
    shellPath: {} as never,
    executableName: [] as never,
    envShell: null as never,
  });

  assert.equal(malformedHints.ok, false);
  if (!malformedHints.ok) {
    assert.equal(malformedHints.error.code, "MISSING_SHELL_HINT");
    assert.equal(malformedHints.error.publicSafe, true);
    assert.equal(malformedHints.error.safeForRuntimeInspection, true);
  }

  const malformedMetadata = detectShellType({
    context: { runtimeId: "runtime-1", auditMetadata: [] as never },
    shellPath: "/bin/bash",
    metadata: "not-an-object" as never,
  });

  assert.equal(malformedMetadata.ok, true);
  if (malformedMetadata.ok) {
    assert.deepEqual(malformedMetadata.report.audit.metadata, {});
  }
});

test("executeShellTypeDetection best-practice wrapper drops malformed audit metadata", async () => {
  const result = await executeShellTypeDetectionBestPractice({
    context: { runtimeId: "runtime-1", auditMetadata: ["SECRET_VALUE"] as never },
    shellPath: "/bin/bash",
  });

  assert.equal(result.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_VALUE/u);
});

test("executeShellTypeDetection rejects null and non-object requests as public-safe input errors", async () => {
  await assertTypeInputError(executeShellTypeDetection(null as never));
  await assertTypeInputError(executeShellTypeDetection(1 as never));
  await assertTypeInputError(executeShellTypeDetection("bad" as never));
  await assertTypeInputError(executeShellTypeDetection([] as never));
});

test("shell type best-practice wrapper rejects null and non-object requests as public-safe input errors", async () => {
  await assertTypeInputError(executeShellTypeDetectionBestPractice(null as never));
  await assertTypeInputError(executeShellTypeDetectionBestPractice(1 as never));
  await assertTypeInputError(executeShellTypeDetectionBestPractice("bad" as never));
  await assertTypeInputError(executeShellTypeDetectionBestPractice([] as never));
});

test("executeShellTypeDetection keeps dry-run provider-free and gates real probing", async () => {
  let providerCalled = false;
  const dryRun = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1" },
    shellPath: "/bin/bash",
    provider: () => {
      providerCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(dryRun.ok, true);
  assert.equal(providerCalled, false);

  const denied = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false },
    shellPath: "/bin/bash",
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

test("executeShellTypeDetection intercepts malformed real targets before provider dispatch", async () => {
  let providerCalls = 0;
  const result = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    shellPath: {} as never,
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_SHELL_HINT");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellTypeDetection rejects unsafe shell hints and malformed guard reasons before provider dispatch", async () => {
  let providerCalls = 0;
  const unsafeHint = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    shellPath: "/bin/sh\nbad",
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(unsafeHint.ok, false);
  if (!unsafeHint.ok) {
    assert.equal(unsafeHint.error.code, "INVALID_SHELL_HINT");
    assert.equal(unsafeHint.error.safeForRuntimeInspection, true);
  }
  assert.equal(providerCalls, 0);

  const malformedReason = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { reason: { secret: "TOKEN=abc" } } } as never,
    shellPath: "/bin/bash",
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(malformedReason.ok, false);
  if (!malformedReason.ok) {
    assert.equal(malformedReason.error.code, "GOVERNANCE_REJECTED");
    assert.equal(malformedReason.error.message, "shell.typeDetection requires an affirmative runtime guard for real probing");
    assert.doesNotMatch(JSON.stringify(malformedReason), /TOKEN=abc/u);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellTypeDetection returns stable provider errors without leaking provider details", async () => {
  const missingProvider = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    shellPath: "/bin/bash",
  });

  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const rejected = await executeShellTypeDetection({
    context: { runtimeId: "runtime-1", dryRun: false, guard: { accepted: true } },
    shellPath: "/bin/bash",
    provider: () => {
      throw new Error("SHELL_SECRET=token-value");
    },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.typeDetection provider rejected the probe");
    assert.doesNotMatch(JSON.stringify(rejected), /SHELL_SECRET|token-value/u);
  }
});

test("shellTypeDetectionHandler and registry invoke a runtime-supplied executor", async () => {
  const result = await shellTypeDetectionHandler.invoke({
    toolCallId: "type-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      shellPath: "/bin/bash",
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: { exitCode: 0, stdout: "argv0=bash\nshell=/bin/bash\nflags=hB\n", stderr: "" },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.deepEqual(result.output.requiredPermissions, ["shell:detect"]);
    assert.equal(result.output.detectedType, "bash");
    assert.equal(result.output.normalizedShellName, "bash");
  }

  const lookup = createBaseToolRegistry().lookupHandler("shell.typeDetection");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    assert.fail("shell.typeDetection handler should be registered");
  }

  const registryResult = await lookup.handler.invoke({
    toolCallId: "registry-type-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      shellPath: "/bin/bash",
      context: { runtimeId: "runtime-1", auditMetadata: ["SECRET_VALUE"] as never },
    },
    executor: {},
  });

  assert.equal(registryResult.ok, true);
  if (registryResult.ok) {
    const output = registryResult.output as { detectedType: string; dispatch: string };
    assert.equal(output.detectedType, "bash");
    assert.equal(output.dispatch, "dry-run");
    assert.doesNotMatch(JSON.stringify(registryResult), /SECRET_VALUE/u);
  }
});

test("shellTypeDetectionHandler maps runtime executor failures to public-safe provider errors", async () => {
  const result = await shellTypeDetectionHandler.invoke({
    toolCallId: "type-failure-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      shellPath: "/bin/bash",
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: false,
          error: {
            code: "SHELL_SECRET",
            message: "SHELL_SECRET=token-value",
            publicSafe: true,
          },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(JSON.stringify(result), /SHELL_SECRET|token-value/u);
  }
});

test("detectShellType returns public-safe errors for malformed runtime JSON", () => {
  const malformed = detectShellType({
    context: { runtimeId: 1 } as never,
    shellPath: "/bin/bash",
  });

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "MISSING_RUNTIME_ID");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
  }
});
