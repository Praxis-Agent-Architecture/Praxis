import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../../../../agentCoreContractTestHelper.js";
import {
  executeShellEnvironmentInspection,
  inspectShellEnvironment,
  shellEnvironmentInspectionHandler,
  shellEnvironmentInspectionDescriptor,
} from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.js";
import { createBaseToolRegistry } from "../../../../../../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { executeShellEnvironmentInspection as executeShellEnvironmentInspectionBestPractice } from "../../../../../../../src/storagePool/baseToolStorage/shellBase/shellDetection/shell.environmentInspection/bestPractice.js";

type ShellEnvironmentExecutionResult = Awaited<ReturnType<typeof executeShellEnvironmentInspection>>;

async function assertEnvironmentInputError(
  operation: Promise<ShellEnvironmentExecutionResult>,
  code = "MISSING_WORKING_DIRECTORY",
): Promise<void> {
  await assert.doesNotReject(operation);
  const result = await operation;
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("shell.environmentInspection malformed request should fail");
  }
  assert.equal(result.error.code, code);
  assert.equal(result.error.boundary, "input");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
}

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.ts",
  docPath: "docs/agentCore/agent_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.md",
  testFileUrl: import.meta.url,
});

test("inspectShellEnvironment summarizes a provided dry-run environment snapshot", () => {
  const result = inspectShellEnvironment({
    target: {
      workingDirectory: " /workspace/project/ ",
      shellExecutable: "/bin/zsh",
      environment: {
        PATH: "/usr/bin:/bin",
        OPENAI_API_KEY: "secret-value",
        LANG: "en_US.UTF-8",
      },
      variablesToInspect: ["PATH", "OPENAI_API_KEY", "LANG"],
    },
    context: {
      invocationId: " env-check ",
      allowedWorkingDirectories: ["/workspace"],
      grantedPermissions: ["shell:environment:inspect"],
    },
  });

  if (!result.ok) {
    assert.fail(result.error.message);
  }

  assert.equal(result.toolId, "shell.environmentInspection");
  assert.equal(result.output.target.workingDirectory, "/workspace/project");
  assert.deepEqual(result.output.pathEntries, ["/usr/bin", "/bin"]);
  assert.equal(result.output.variables.find((item) => item.name === "OPENAI_API_KEY")?.redacted, true);
  assert.equal(result.output.variables.find((item) => item.name === "LANG")?.valuePreview, "en_US.UTF-8");
  assert.equal(result.output.dryRun, true);
  assert.equal(result.output.executionBlocked, true);
  assert.equal(result.output.inspectionEnvelope.realProcessReadRequired, false);
  assert.equal(shellEnvironmentInspectionDescriptor.unsafeSideEffects, false);
});

test("inspectShellEnvironment rejects empty input and invalid variable names", () => {
  const missing = inspectShellEnvironment();
  assert.equal(missing.ok, false);
  if (missing.ok) {
    assert.fail("missing working directory should fail");
  }
  assert.equal(missing.error.code, "MISSING_WORKING_DIRECTORY");
  assert.equal(missing.error.publicSafe, true);

  const invalidVariable = inspectShellEnvironment({
    target: {
      workingDirectory: "/workspace",
      variablesToInspect: ["NOT-A-SHELL-VAR"],
    },
  });

  assert.equal(invalidVariable.ok, false);
  if (invalidVariable.ok) {
    assert.fail("invalid variable name should fail");
  }
  assert.equal(invalidVariable.error.code, "INVALID_VARIABLE_NAME");
});

test("inspectShellEnvironment rejects malformed env snapshots and variable lists without raw env exposure", () => {
  const malformedEnv = inspectShellEnvironment({
    target: {
      workingDirectory: "/workspace",
      environment: { OPENAI_API_KEY: 123 } as never,
    },
  });

  assert.equal(malformedEnv.ok, false);
  if (!malformedEnv.ok) {
    assert.equal(malformedEnv.error.code, "INVALID_ENVIRONMENT");
    assert.equal(malformedEnv.error.publicSafe, true);
    assert.doesNotMatch(JSON.stringify(malformedEnv), /secret-value|OPENAI_API_KEY=abc/u);
  }

  const malformedVariables = inspectShellEnvironment({
    target: {
      workingDirectory: "/workspace",
      environment: { PATH: "/bin" },
      variablesToInspect: [{}] as never,
    },
  });

  assert.equal(malformedVariables.ok, false);
  if (!malformedVariables.ok) {
    assert.equal(malformedVariables.error.code, "INVALID_VARIABLE_NAME");
    assert.equal(malformedVariables.error.safeForRuntimeInspection, true);
  }
});

test("inspectShellEnvironment enforces directory scope, permissions, and dry-run boundary", () => {
  const outOfScope = inspectShellEnvironment({
    target: { workingDirectory: "/tmp/outside" },
    context: { allowedWorkingDirectories: ["/workspace"] },
  });

  assert.equal(outOfScope.ok, false);
  if (outOfScope.ok) {
    assert.fail("out-of-scope working directory should fail");
  }
  assert.equal(outOfScope.error.code, "SCOPE_REJECTED");

  const missingPermission = inspectShellEnvironment({
    target: { workingDirectory: "/workspace" },
    context: { grantedPermissions: ["filesystem:read"] },
  });

  assert.equal(missingPermission.ok, false);
  if (missingPermission.ok) {
    assert.fail("missing shell environment permission should fail");
  }
  assert.equal(missingPermission.error.code, "PERMISSION_DENIED");

  const realInspection = inspectShellEnvironment({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false },
  });

  assert.equal(realInspection.ok, false);
  if (realInspection.ok) {
    assert.fail("real environment inspection should be blocked");
  }
  assert.equal(realInspection.error.code, "REAL_INSPECTION_BLOCKED");
});

test("executeShellEnvironmentInspection keeps dry-run provider-free and gates real inspection", async () => {
  let providerCalled = false;
  const dryRun = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    provider: () => {
      providerCalled = true;
      throw new Error("should not run");
    },
  });

  assert.equal(dryRun.ok, true);
  assert.equal(providerCalled, false);

  const denied = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
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

test("executeShellEnvironmentInspection returns stable provider errors without leaking secrets", async () => {
  const missingProvider = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false, guard: { allowed: true } },
  });

  assert.equal(missingProvider.ok, false);
  if (!missingProvider.ok) {
    assert.equal(missingProvider.error.code, "PROVIDER_UNAVAILABLE");
  }

  const rejected = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("OPENAI_API_KEY=secret-value");
    },
  });

  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, "PROVIDER_REJECTED");
    assert.equal(rejected.error.message, "shell.environmentInspection provider rejected the inspection");
    assert.doesNotMatch(JSON.stringify(rejected), /OPENAI_API_KEY=secret-value|secret-value/u);
  }

  const unsafeProviderSuccess = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => ({
      kind: "agentCore.basicTool.shell.environmentInspection",
      target: { workingDirectory: "/workspace" },
      variables: [
        {
          name: "OPENAI_API_KEY",
          present: true,
          redacted: false,
          valuePreview: "secret-value",
        },
        {
          name: "LANG",
          present: true,
          redacted: false,
          valuePreview: "en_US.UTF-8",
        },
      ],
      pathEntries: ["/bin"],
      permissionsRequired: ["shell:environment:inspect"],
      dryRun: false,
      executionBlocked: false,
      unsafeSideEffects: false,
      inspectionEnvelope: {
        operation: "inspect-shell-environment",
        source: "provided-snapshot",
        realProcessReadRequired: true,
      },
    }),
  });

  assert.equal(unsafeProviderSuccess.ok, true);
  if (unsafeProviderSuccess.ok) {
    assert.equal(
      unsafeProviderSuccess.output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.redacted,
      true,
    );
    assert.equal(
      unsafeProviderSuccess.output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.valuePreview,
      undefined,
    );
    assert.equal(
      unsafeProviderSuccess.output.variables.find((variable) => variable.name === "LANG")?.valuePreview,
      "en_US.UTF-8",
    );
    assert.doesNotMatch(JSON.stringify(unsafeProviderSuccess), /secret-value/u);
  }
});

test("inspectShellEnvironment redacts common DSN and session credential carriers", () => {
  const result = inspectShellEnvironment({
    target: {
      workingDirectory: "/workspace",
      environment: {
        DATABASE_URL: "postgres://user:pass@host/db",
        REDIS_URL: "redis://:pass@localhost:6379",
        COOKIE: "session=secret",
        LANG: "en_US.UTF-8",
      },
      variablesToInspect: ["DATABASE_URL", "REDIS_URL", "COOKIE", "LANG"],
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("credential carrier snapshot should be inspectable");
  }

  for (const name of ["DATABASE_URL", "REDIS_URL", "COOKIE"]) {
    const variable: { redacted: boolean; valuePreview?: string } | undefined = result.output.variables.find(
      (item) => item.name === name,
    );
    assert.equal(variable?.redacted, true);
    assert.equal(variable?.valuePreview, undefined);
  }
  assert.equal(result.output.variables.find((item) => item.name === "LANG")?.valuePreview, "en_US.UTF-8");
  assert.doesNotMatch(JSON.stringify(result), /postgres:\/\/user:pass|redis:\/\/:pass|session=secret/u);
});

test("executeShellEnvironmentInspection sanitizes provider DSN previews", async () => {
  const result = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => ({
      kind: "agentCore.basicTool.shell.environmentInspection",
      target: { workingDirectory: "/workspace" },
      variables: [
        {
          name: "DATABASE_URL",
          present: true,
          redacted: false,
          valuePreview: "postgres://user:pass@host/db",
        },
      ],
      pathEntries: [],
      permissionsRequired: ["shell:environment:inspect"],
      dryRun: false,
      executionBlocked: false,
      unsafeSideEffects: false,
      inspectionEnvelope: {
        operation: "inspect-shell-environment",
        source: "provided-snapshot",
        realProcessReadRequired: true,
      },
    }),
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.variables[0]?.redacted, true);
    assert.equal(result.output.variables[0]?.valuePreview, undefined);
    assert.doesNotMatch(JSON.stringify(result), /postgres:\/\/user:pass/u);
  }
});

test("executeShellEnvironmentInspection rejects null and non-object requests as public-safe input errors", async () => {
  await assertEnvironmentInputError(executeShellEnvironmentInspection(null as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspection(1 as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspection("bad" as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspection([] as never));
});

test("shell environment best-practice wrapper rejects null and non-object requests as public-safe input errors", async () => {
  await assertEnvironmentInputError(executeShellEnvironmentInspectionBestPractice(null as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspectionBestPractice(1 as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspectionBestPractice("bad" as never));
  await assertEnvironmentInputError(executeShellEnvironmentInspectionBestPractice([] as never));
});

test("executeShellEnvironmentInspection intercepts malformed real targets before provider dispatch", async () => {
  let providerCalls = 0;
  const result = await executeShellEnvironmentInspection({
    target: {
      workingDirectory: "/workspace",
      environment: { SECRET: 1 },
    } as never,
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_ENVIRONMENT");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellEnvironmentInspection rejects unsafe shell executable before provider dispatch", async () => {
  let providerCalls = 0;
  const result = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace", shellExecutable: "/bin/sh\nbad" },
    context: { dryRun: false, guard: { allowed: true } },
    provider: () => {
      providerCalls += 1;
      throw new Error("provider should not run");
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INVALID_SHELL_EXECUTABLE");
    assert.equal(result.error.safeForRuntimeInspection, true);
  }
  assert.equal(providerCalls, 0);
});

test("executeShellEnvironmentInspection drops malformed guard reasons from public errors", async () => {
  const result = await executeShellEnvironmentInspection({
    target: { workingDirectory: "/workspace" },
    context: { dryRun: false, guard: { reason: { secret: "TOKEN=abc" } } } as never,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "GOVERNANCE_REJECTED");
    assert.equal(result.error.message, "shell.environmentInspection requires an affirmative runtime guard for real inspection");
    assert.doesNotMatch(JSON.stringify(result), /TOKEN=abc/u);
  }
});

test("shellEnvironmentInspectionHandler redacts DSNs from runtime executor output", async () => {
  const result = await shellEnvironmentInspectionHandler.invoke({
    toolCallId: "env-dsn-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { workingDirectory: "/workspace", variablesToInspect: ["DATABASE_URL"] },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: { exitCode: 0, stdout: "DATABASE_URL=postgres://user:pass@host/db\n", stderr: "" },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.variables[0]?.redacted, true);
    assert.equal(result.output.variables[0]?.valuePreview, undefined);
    assert.doesNotMatch(JSON.stringify(result), /postgres:\/\/user:pass/u);
  }
});

test("shellEnvironmentInspectionHandler and registry invoke a runtime-supplied executor", async () => {
  const result = await shellEnvironmentInspectionHandler.invoke({
    toolCallId: "env-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { workingDirectory: "/workspace", variablesToInspect: ["PATH"] },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({ ok: true, output: { exitCode: 0, stdout: "PATH=/bin\n", stderr: "" } }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.dryRun, false);
    assert.deepEqual(result.output.pathEntries, ["/bin"]);
    assert.equal(result.output.variables.find((variable) => variable.name === "PATH")?.valuePreview, "/bin");
  }

  const lookup = createBaseToolRegistry().lookupHandler("shell.environmentInspection");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) {
    assert.fail("shell.environmentInspection handler should be registered");
  }

  const registryResult = await lookup.handler.invoke({
    toolCallId: "registry-env-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: {
        workingDirectory: "/workspace",
        environment: { PATH: "/bin", OPENAI_API_KEY: "secret-value" },
        variablesToInspect: ["PATH", "OPENAI_API_KEY"],
      },
      context: { auditMetadata: ["SECRET_VALUE"] as never },
    },
    executor: {},
  });

  assert.equal(registryResult.ok, true);
  if (registryResult.ok) {
    const output = registryResult.output as {
      variables: readonly { name: string; redacted: boolean; valuePreview?: string }[];
    };
    assert.equal(output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.redacted, true);
    assert.equal(output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.valuePreview, undefined);
    assert.doesNotMatch(JSON.stringify(registryResult), /SECRET_VALUE/u);
  }
});

test("shellEnvironmentInspectionHandler redacts runtime env and hides executor failure details", async () => {
  const result = await shellEnvironmentInspectionHandler.invoke({
    toolCallId: "env-secret-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { workingDirectory: "/workspace", variablesToInspect: ["PATH", "OPENAI_API_KEY"] },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: true,
          output: { exitCode: 0, stdout: "PATH=/bin\nOPENAI_API_KEY=secret-value\n", stderr: "" },
        }),
      },
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.redacted, true);
    assert.equal(result.output.variables.find((variable) => variable.name === "OPENAI_API_KEY")?.valuePreview, undefined);
    assert.doesNotMatch(JSON.stringify(result.output), /secret-value/u);
  }

  const failed = await shellEnvironmentInspectionHandler.invoke({
    toolCallId: "env-failure-call",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { workingDirectory: "/workspace" },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: {
      shell: {
        run: async () => ({
          ok: false,
          error: { code: "ENV_SECRET", message: "OPENAI_API_KEY=secret-value", publicSafe: true },
        }),
      },
    },
  });

  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.error.code, "PROVIDER_REJECTED");
    assert.doesNotMatch(JSON.stringify(failed), /OPENAI_API_KEY=secret-value|secret-value/u);
  }
});

test("inspectShellEnvironment returns public-safe errors for malformed runtime JSON", () => {
  const malformed = inspectShellEnvironment({
    target: { workingDirectory: 1, variablesToInspect: {} } as never,
  });

  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.error.code, "MISSING_WORKING_DIRECTORY");
    assert.equal(malformed.error.safeForRuntimeInspection, true);
  }
});
