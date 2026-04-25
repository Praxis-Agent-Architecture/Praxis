import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeShellCapabilityDetection,
  planShellCapabilityDetection,
  shellCapabilityDetectionHandler,
  shellCapabilityDetectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeShellCapabilityDetection as executeShellCapabilityDetectionBestPractice } from "../../../../../../../src/storagePool/baseToolStorage/shellBase/shellDetection/shell.capabilityDetection/bestPractice.js";

type ShellCapabilityExecutionResult = Awaited<ReturnType<typeof executeShellCapabilityDetection>>;

async function assertCapabilityInputError(
  operation: Promise<ShellCapabilityExecutionResult>,
  code = "MISSING_SHELL_EXECUTABLE",
): Promise<void> {
  await assert.doesNotReject(operation);
  const result = await operation;
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("shell.capabilityDetection malformed request should fail");
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
}

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.md",
  testFileUrl: import.meta.url,
});

test("planShellCapabilityDetection returns inferred shell capability findings", () => {
  const result = planShellCapabilityDetection({
    target: {
      shellExecutable: " /bin/bash ",
      requestedCapabilities: ["pipeline", "job-control"],
      reportedVersion: "5.2",
    },
    context: {
      invocationId: " detect-shell ",
      allowedShellExecutables: ["/bin/bash"],
      grantedPermissions: ["shell:detect"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.capabilityDetection");
  assert.equal(result.output.target.shellExecutable, "/bin/bash");
  assert.equal(result.output.target.shellKind, "bash");
  assert.deepEqual(result.output.requestedCapabilities, ["pipeline", "job-control"]);
  assert.equal(result.output.findings.every((finding) => finding.status === "supported"), true);
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.probePlan.realProbeRequired, false);
  assert.equal(shellCapabilityDetectionDescriptor.unsafeSideEffects, false);
});

test("planShellCapabilityDetection rejects empty input and out-of-scope shells", () => {
  const missing = planShellCapabilityDetection();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing shell executable should fail");
  }
  assert.equal(missing.error.code, "MISSING_SHELL_EXECUTABLE");
  assert.equal(missing.error.boundary, "input");

  const outOfScope = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/zsh" },
    context: { allowedShellExecutables: ["/bin/bash"] },
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("out-of-scope shell should fail");
  }
  assert.equal(outOfScope.error.code, "SCOPE_REJECTED");
});

test("planShellCapabilityDetection rejects blank explicit shell kind", () => {
  const result = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash", shellKind: "   " },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("blank shell kind should fail instead of being inferred");
  }
  assert.equal(result.error.code, "INVALID_SHELL_KIND");
  assert.equal(result.error.boundary, "input");
});

test("planShellCapabilityDetection rejects malformed capability lists as public-safe input errors", () => {
  const wrongShape = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash", requestedCapabilities: {} } as never,
  });

  assert.equal(wrongShape.ok, false);
  if (!wrongShape.ok) {
    assert.equal(wrongShape.error.code, "INVALID_CAPABILITY_LIST");
    assert.equal(wrongShape.error.publicSafe, true);
    assert.equal(wrongShape.error.safeForRuntimeInspection, true);
  }

  const unknownCapability = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash", requestedCapabilities: ["pipeline", "approve-execution"] } as never,
  });

  assert.equal(unknownCapability.ok, false);
  if (!unknownCapability.ok) {
    assert.equal(unknownCapability.error.code, "INVALID_CAPABILITY_LIST");
    assert.equal(unknownCapability.error.internalDetailExposed, false);
  }
});

test("planShellCapabilityDetection blocks real probing and enforces permissions when supplied", () => {
  const missingPermission = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { grantedPermissions: ["shell:probe"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("missing shell:detect should fail");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realProbe = planShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false },
  });

  assert.equal(realProbe.ok, false);
  if (realProbe.ok) {
    assert.fail("real shell probing should be blocked");
  }
  assert.equal(realProbe.error.code, "REAL_PROBE_BLOCKED");
});

test("executeShellCapabilityDetection keeps dry-run provider-free and gates real probing", async () => {
  let providerCalled = false;
  const dryRun = await executeShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    provider: () => {
      providerCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(dryRun.ok, true);
  assert.equal(providerCalled, false);

  const denied = await executeShellCapabilityDetection({
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

test("executeShellCapabilityDetection returns stable provider errors without leaking provider details", async () => {
  const missingProvider = await executeShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false, guard: { allowed: true } },
  });

  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(missingProvider), /SECRET|token-value/u);
  }

  const rejected = await executeShellCapabilityDetection({
    target: { shellExecutable: "/bin/bash" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("SECRET=token-value");
    },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.capabilityDetection provider rejected the probe");
    assert.doesNotMatch(JSON.stringify(rejected), /SECRET|token-value/u);
  }
});

test("executeShellCapabilityDetection rejects null and non-object requests as public-safe input errors", async () => {
  await assertCapabilityInputError(executeShellCapabilityDetection(null as never));
  await assertCapabilityInputError(executeShellCapabilityDetection(1 as never));
  await assertCapabilityInputError(executeShellCapabilityDetection("bad" as never));
  await assertCapabilityInputError(executeShellCapabilityDetection([] as never));
});

test("shell capability best-practice wrapper rejects null and non-object requests as public-safe input errors", async () => {
  await assertCapabilityInputError(executeShellCapabilityDetectionBestPractice(null as never));
  await assertCapabilityInputError(executeShellCapabilityDetectionBestPractice(1 as never));
  await assertCapabilityInputError(executeShellCapabilityDetectionBestPractice("bad" as never));
  await assertCapabilityInputError(executeShellCapabilityDetectionBestPractice([] as never));
});

test("executeShellCapabilityDetection intercepts malformed real targets before provider dispatch", async () => {
  let providerCalls = 0;
  const result = await executeShellCapabilityDetection({
    target: { shellExecutable: 1 } as never,
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "MISSING_SHELL_EXECUTABLE");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellCapabilityDetection rejects unsafe shell executable and malformed guard reason before provider dispatch", async () => {
  let providerCalls = 0;
  const unsafeExecutable = await executeShellCapabilityDetection({
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

  const malformedReason = await executeShellCapabilityDetection({
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
    assert.equal(malformedReason.error.message, "shell.capabilityDetection requires an affirmative runtime guard for real probing");
    assert.doesNotMatch(JSON.stringify(malformedReason), /TOKEN=abc/u);
  }
  assert.equal(providerCalls, 0);
});

test("shellCapabilityDetectionHandler and registry invoke a runtime-supplied executor", async () => {
  const result = await shellCapabilityDetectionHandler.invoke({
    toolCallId: "capability-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/bash" },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: {
            exitCode: 0,
            stdout: [
              "command-execution=supported",
              "script-execution=supported",
              "pipeline=supported",
              "environment-expansion=supported",
              "interactive-session=unknown",
              "job-control=unknown",
              "posix-signals=supported",
            ].join("\n"),
            stderr: "",
          },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.equal(result.output.executionBlocked, false);
    assert.equal(result.output.findings.find((finding) => finding.capability === "pipeline")?.status, "supported");
    assert.match(result.output.findings[0]?.evidence ?? "", /runtime shell probe/);
  }

  const lookup = createBaseToolRegistry().lookupHandler("shell.capabilityDetection");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    assert.fail("shell.capabilityDetection handler should be registered");
  }

  const registryResult = await lookup.handler.invoke({
    toolCallId: "registry-capability-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/bash", requestedCapabilities: ["pipeline"] },
      context: { auditMetadata: ["SECRET_VALUE"] as never },
    },
    executor: {},
  });
  assert.equal(registryResult.ok, true);
  if (registryResult.ok) {
    const output = registryResult.output as { requestedCapabilities: readonly string[] };
    assert.equal(output.requestedCapabilities[0], "pipeline");
    assert.doesNotMatch(JSON.stringify(registryResult), /SECRET_VALUE/u);
  }
});

test("shellCapabilityDetectionHandler maps runtime executor failures to public-safe provider errors", async () => {
  const result = await shellCapabilityDetectionHandler.invoke({
    toolCallId: "capability-failure-call",
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
            code: "RUNTIME_SECRET",
            message: "SECRET=token-value",
            publicSafe: true,
          },
        }),
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(JSON.stringify(result), /SECRET|token-value/u);
  }
});

test("planShellCapabilityDetection returns public-safe errors for malformed runtime JSON", () => {
  const malformedTarget = planShellCapabilityDetection({
    target: { shellExecutable: 1 } as never,
  });

  assert.equal(malformedTarget.ok, false);
  if (!malformedTarget.ok) {
    assert.equal(malformedTarget.error.code, "MISSING_SHELL_EXECUTABLE");
    assert.equal(malformedTarget.error.safeForRuntimeInspection, true);
  }
});
