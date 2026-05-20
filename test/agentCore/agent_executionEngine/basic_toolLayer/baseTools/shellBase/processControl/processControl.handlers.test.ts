import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeShellBackgroundExecution,
  planShellBackgroundExecution,
  shellBackgroundExecutionHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.backgroundExecution.js";
import {
  executeShellDetachedExecution,
  planShellDetachedExecution,
  shellDetachedExecutionHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.detachedExecution.js";
import {
  executeShellForegroundExecution,
  planShellForegroundExecution,
  shellForegroundExecutionHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.foregroundExecution.js";
import {
  executeShellProcessSpawning,
  planShellProcessSpawn,
  shellProcessSpawningHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processSpawning.js";
import {
  executeShellProcessTermination,
  planShellProcessTermination,
  shellProcessTerminationHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.processTermination.js";
import {
  executeShellServiceStartAndVerify,
  planShellServiceStartAndVerify,
  shellServiceStartAndVerifyHandler,
} from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/shellBase/processControl/shell.serviceStartAndVerify.js";

test("processControl handlers are mounted in the builtin baseTool registry", () => {
  const registry = createBaseToolRegistry();

  for (const handler of [
    shellBackgroundExecutionHandler,
    shellDetachedExecutionHandler,
    shellForegroundExecutionHandler,
    shellProcessSpawningHandler,
    shellProcessTerminationHandler,
    shellServiceStartAndVerifyHandler,
  ]) {
    const lookup = registry.lookupHandler(handler.definition.toolId);
    assert.equal(lookup.ok, true);
    if (!lookup.ok) throw new Error("registry lookup should succeed");
    assert.equal(lookup.handler.definition.toolId, handler.definition.toolId);
  }
});

test("processControl real execution requires an affirmative runtime guard", async () => {
  const result = await executeShellForegroundExecution({
    target: { command: "printf ok" },
    context: { runtimeId: "runtime-1", dryRun: false },
    provider: async () => ({ resultEnvelope: { exitCode: 0 } }),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("real execution without guard should fail");
  assert.equal(result.error.code, "GOVERNANCE_REJECTED");
});

test("processControl real execution reports missing providers without hidden local fallback", async () => {
  const result = await executeShellBackgroundExecution({
    target: { command: "npm run dev" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("real execution without provider should fail");
  assert.equal(result.error.code, "PROVIDER_UNAVAILABLE");
});

test("processControl dry-run does not call providers", async () => {
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return { resultEnvelope: { shouldNotAppear: true } };
  };

  const results = await Promise.all([
    executeShellBackgroundExecution({ target: { command: "npm run dev" }, provider }),
    executeShellDetachedExecution({
      target: { command: "node server.js" },
      context: { approval: { accepted: true } },
      provider,
    }),
    executeShellForegroundExecution({ target: { command: "printf ok" }, provider }),
    executeShellProcessSpawning({ target: { executable: "node" }, provider }),
    executeShellProcessTermination({ target: { processId: 42 }, provider }),
    executeShellServiceStartAndVerify({
      target: { command: "npm run dev", verification: { kind: "http", url: "http://127.0.0.1:3000/" } },
      context: { approval: { accepted: true } },
      provider,
    }),
  ]);

  assert.equal(calls, 0);
  assert.equal(results.every((result) => result.ok), true);
});

test("processControl missing, malformed, and denied guards reject before providers", async () => {
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return { resultEnvelope: { shouldNotAppear: true } };
  };

  for (const guard of [undefined, null, {}, { allowed: false }, { accepted: false }] as const) {
    const result = await executeShellProcessSpawning({
      target: { executable: "node" },
      context: { runtimeId: "runtime-1", dryRun: false, guard } as never,
      provider,
    });

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("guard rejection should fail");
    assert.equal(result.error.code, "GOVERNANCE_REJECTED");
  }

  assert.equal(calls, 0);
});

test("processControl provider failures are mapped to public-safe provider errors", async () => {
  const result = await executeShellForegroundExecution({
    target: { command: "printf ok" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => {
      throw new Error("internal secret stack detail");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("provider failure should fail");
  assert.equal(result.error.code, "PROVIDER_REJECTED");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);
  assert.equal(result.error.message.includes("internal secret"), false);
});

test("foreground execution preserves runtime timeout failures for caller cleanup", async () => {
  const result = await executeShellForegroundExecution({
    target: { command: "npm run dev", timeoutMs: 1 },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    executor: {
      shell: {
        async run() {
          return {
            ok: false as const,
            error: {
              code: "EXECUTION_TIMEOUT",
              message: "runtime process execution timed out",
              publicSafe: true as const,
            },
          };
        },
      },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("foreground timeout should fail");
  assert.equal(result.error.code, "EXECUTION_TIMEOUT");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.message.includes("timed out"), true);
});

test("processControl direct bestPractice APIs reject non-record requests without raw TypeError", async () => {
  const apis = [
    { name: "background", expectedCode: "MISSING_COMMAND", run: executeShellBackgroundExecution },
    { name: "detached", expectedCode: "MISSING_COMMAND", run: executeShellDetachedExecution },
    { name: "foreground", expectedCode: "MISSING_COMMAND", run: executeShellForegroundExecution },
    { name: "spawning", expectedCode: "MISSING_TARGET", run: executeShellProcessSpawning },
    { name: "termination", expectedCode: "MISSING_PROCESS_ID", run: executeShellProcessTermination },
    { name: "service", expectedCode: "MISSING_COMMAND", run: executeShellServiceStartAndVerify },
  ] as const;
  const inputs = [undefined, null, 1, "bad", []] as const;

  for (const api of apis) {
    for (const input of inputs) {
      let result:
        | {
            ok: boolean;
            error?: {
              code: string;
              safeForRuntimeInspection: boolean;
              internalDetailExposed: boolean;
            };
          }
        | undefined;

      await assert.doesNotReject(async () => {
        result = await api.run(input as never);
      }, `${api.name} should not throw for ${String(input)}`);

      assert.equal(result?.ok, false);
      assert.equal(result?.error?.code, api.expectedCode);
      assert.notEqual(result?.error?.code, "PROVIDER_REJECTED");
      assert.equal(result?.error?.safeForRuntimeInspection, true);
      assert.equal(result?.error?.internalDetailExposed, false);
    }
  }
});

test("processControl planners classify malformed JSON without throwing raw TypeError", () => {
  const cases = [
    () => planShellBackgroundExecution({ target: { command: 1, workingDirectory: {} } as never, context: { invocationId: 1 } as never }),
    () => planShellBackgroundExecution({ target: { command: "ok", workingDirectory: 1 } as never }),
    () => planShellBackgroundExecution({ target: { command: "ok", shell: 1 } as never }),
    () => planShellBackgroundExecution({ target: { command: "ok", captureOutput: "false" } as never }),
    () => planShellDetachedExecution({ target: { command: "ok", workingDirectory: 1 } as never, context: { approval: { accepted: true } } }),
    () => planShellDetachedExecution({ target: { command: "ok", restartPolicy: 1 } as never, context: { approval: { accepted: true } } }),
    () => planShellDetachedExecution({ target: { command: "ok", stdoutLogPath: {} } as never, context: { approval: { accepted: true } } }),
    () => planShellForegroundExecution({ target: { command: "ok", stdin: {} } as never }),
    () => planShellForegroundExecution({ target: { command: "ok", captureStdout: "yes" } as never }),
    () => planShellProcessSpawn({ target: { executable: "node", args: {}, env: { OK: 1 } } as never }),
    () => planShellProcessSpawn({ target: { executable: "node", stdio: 1 } as never }),
    () => planShellProcessSpawn({ target: { executable: "node" }, launchMode: "backgroundish" as never }),
    () => planShellProcessTermination({ target: { processId: "42", reason: {} } as never }),
    () => planShellProcessTermination({ target: { processId: 42, signal: 9 } as never }),
    () => planShellProcessTermination({ target: { processId: 42, force: "true" } as never }),
    () => planShellServiceStartAndVerify({ target: { command: "ok", shell: "fish" } as never }),
    () => planShellServiceStartAndVerify({ target: { command: "ok", verification: { kind: "http", url: 1 } } as never }),
    () => planShellServiceStartAndVerify({ target: { command: "ok", verification: { kind: "command", command: {} } } as never }),
    () => planShellServiceStartAndVerify({ target: { command: "ok", outputBufferLimitBytes: -1 } as never }),
  ];

  for (const run of cases) {
    assert.doesNotThrow(run);
    const result = run();
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("malformed JSON should fail");
    assert.equal(result.error.publicSafe, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
});

test("processControl malformed real targets reject before provider dispatch", async () => {
  let calls = 0;
  const provider = async () => {
    calls += 1;
    return { resultEnvelope: { unexpected: true } };
  };

  const results = await Promise.all([
    executeShellBackgroundExecution({
      target: { command: 1 } as never,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
      provider,
    }),
    executeShellForegroundExecution({
      target: { command: "printf ok", stdin: {} } as never,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
      provider,
    }),
    executeShellProcessSpawning({
      target: { executable: "node", args: {} } as never,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
      provider,
    }),
    executeShellProcessTermination({
      target: { processId: "bad" } as never,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
      provider,
    }),
    executeShellServiceStartAndVerify({
      target: { command: "npm run dev", verification: { kind: "http", url: 1 } } as never,
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true }, approval: { accepted: true } },
      provider,
    }),
  ]);

  assert.equal(calls, 0);
  for (const result of results) {
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("malformed real target should fail before provider");
    assert.notEqual(result.error.code, "PROVIDER_REJECTED");
    assert.equal(result.error.safeForRuntimeInspection, true);
    assert.equal(result.error.internalDetailExposed, false);
  }
});

test("processControl real execution can call injected runtime providers", async () => {
  const background = await executeShellBackgroundExecution({
    target: { command: "npm run dev" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: { backgroundHandle: "bg-1", pid: 101 } }),
  });
  assert.equal(background.ok, true);
  if (!background.ok) throw new Error("background provider should succeed");
  assert.equal(background.output.dryRun, false);
  assert.equal(background.output.executionBlocked, false);

  const detached = await executeShellDetachedExecution({
    target: { command: "node server.js" },
    context: {
      runtimeId: "runtime-1",
      dryRun: false,
      guard: { allowed: true },
      approval: { accepted: true, approvalId: "approval-1" },
    },
    provider: async () => ({ resultEnvelope: { detachedHandle: "detached-1", pid: 102 } }),
  });
  assert.equal(detached.ok, true);

  const foreground = await executeShellForegroundExecution({
    target: { command: "printf ok" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { accepted: true } },
    provider: async () => ({ resultEnvelope: { exitCode: 0, stdout: "ok", stderr: "" } }),
  });
  assert.equal(foreground.ok, true);

  const spawn = await executeShellProcessSpawning({
    target: { executable: "node", args: ["--version"] },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: { pid: 103, spawnHandle: "spawn-1" } }),
  });
  assert.equal(spawn.ok, true);

  const terminate = await executeShellProcessTermination({
    target: { processId: 103, signal: "SIGTERM" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: { terminated: true, processId: 103 } }),
  });
  assert.equal(terminate.ok, true);

  const service = await executeShellServiceStartAndVerify({
    target: { command: "npm run dev", verification: { kind: "http", url: "http://127.0.0.1:3000/" } },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true }, approval: { accepted: true } },
    provider: async () => ({
      resultEnvelope: {
        serviceHandle: "service-1",
        pid: 104,
        statusSnapshot: {
          handle: "service-1",
          lifecycleKind: "service",
          processState: "running",
          verificationState: "verified",
          verified: true,
        },
      },
    }),
  });
  assert.equal(service.ok, true);
  if (!service.ok) throw new Error("service provider should succeed");
  assert.equal(service.output.resultEnvelope.statusSnapshot?.verified, true);
});

test("processControl real providers receive normalized requests and plain JSON envelopes", async () => {
  const seen: unknown[] = [];

  const background = await executeShellBackgroundExecution({
    target: { command: "  npm run dev  ", workingDirectory: "/tmp///" },
    context: { runtimeId: "runtime-1", invocationId: "call-bg", dryRun: false, guard: { allowed: true } },
    provider: async (request: { target?: { jobId?: string } }) => {
      seen.push(request);
      return { resultEnvelope: { backgroundHandle: request.target?.jobId, pid: 301 }, metadata: { provider: "test" } };
    },
  });

  assert.equal(background.ok, true);
  if (!background.ok) throw new Error("background provider should succeed");
  assert.deepEqual(seen[0], {
    target: {
      command: "npm run dev",
      jobId: "call-bg:background",
      monitorIntervalMs: 1000,
      outputBufferLimitBytes: 65536,
      captureOutput: true,
      shell: "sh",
      workingDirectory: "/tmp",
    },
    context: { runtimeId: "runtime-1", invocationId: "call-bg", dryRun: false, guard: { allowed: true } },
  });

  const spawn = await executeShellProcessSpawning({
    target: { executable: "  node  ", args: ["--version"], env: { OK: "1" }, stdio: "pipe" },
    launchMode: "detached",
    context: { runtimeId: "runtime-1", dryRun: false, guard: { accepted: true } },
    provider: async (request: { launchMode?: string }) => {
      seen.push(request);
      return { resultEnvelope: { spawnHandle: `${request.launchMode}:spawn`, pid: 302 } };
    },
  });

  assert.equal(spawn.ok, true);
  if (!spawn.ok) throw new Error("spawn provider should succeed");
  assert.deepEqual((seen[1] as { target?: unknown; launchMode?: unknown }).target, {
    executable: "node",
    command: undefined,
    args: ["--version"],
    workingDirectory: undefined,
    shell: undefined,
    env: { OK: "1" },
    stdio: "pipe",
  });
  assert.equal((seen[1] as { launchMode?: unknown }).launchMode, "detached");

  const service = await executeShellServiceStartAndVerify({
    target: {
      command: "  npm run dev  ",
      workingDirectory: "/tmp///",
      serviceId: "dev",
      verification: { kind: "http", url: "http://127.0.0.1:3000/", expectedStatus: 204 },
    },
    context: { runtimeId: "runtime-1", invocationId: "call-service", dryRun: false, guard: { accepted: true }, approval: { accepted: true } },
    provider: async (request: { target?: { serviceId?: string; verification?: { expectedStatus?: number } } }) => {
      seen.push(request);
      return {
        resultEnvelope: {
          serviceHandle: request.target?.serviceId,
          statusSnapshot: {
            handle: request.target?.serviceId,
            lifecycleKind: "service",
            processState: "running",
            verificationState: "verified",
            verified: true,
          },
        },
      };
    },
  });

  assert.equal(service.ok, true);
  assert.deepEqual((seen[2] as { target?: unknown }).target, {
    command: "npm run dev",
    workingDirectory: "/tmp",
    shell: "sh",
    serviceId: "dev",
    launchMode: "background",
    restartPolicy: "none",
    outputBufferLimitBytes: 65536,
    captureOutput: true,
    verification: {
      kind: "http",
      url: "http://127.0.0.1:3000/",
      expectedStatus: 204,
      expectedText: undefined,
      method: undefined,
      timeoutMs: 30000,
      intervalMs: 500,
      maxAttempts: 60,
    },
  });
});

test("processControl providers must return explicit plain JSON runtime envelopes", async () => {
  class RuntimeOwnedProcess {
    readonly pid = 401;
    kill() {
      return true;
    }
  }

  const result = await executeShellBackgroundExecution({
    target: { command: "npm run dev" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: new RuntimeOwnedProcess() as never }),
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("raw runtime object should fail");
  assert.equal(result.error.code, "PROVIDER_REJECTED");
  assert.equal(result.error.safeForRuntimeInspection, true);
  assert.equal(result.error.internalDetailExposed, false);

  const missingEnvelope = await executeShellForegroundExecution({
    target: { command: "printf ok" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ metadata: { provider: "test" } }),
  });
  assert.equal(missingEnvelope.ok, false);
  if (missingEnvelope.ok) throw new Error("missing runtime envelope should fail");
  assert.equal(missingEnvelope.error.code, "PROVIDER_REJECTED");

  const dryRunEnvelope = await executeShellProcessSpawning({
    target: { executable: "node" },
    context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    provider: async () => ({ resultEnvelope: { planned: true, spawnHandle: "fake" } }),
  });
  assert.equal(dryRunEnvelope.ok, false);
  if (dryRunEnvelope.ok) throw new Error("dry-run envelope should fail on real provider path");
  assert.equal(dryRunEnvelope.error.code, "PROVIDER_REJECTED");
});

test("processControl registry handlers invoke every real provider path", async () => {
  const registry = createBaseToolRegistry();

  const cases = [
    {
      toolId: "shell.backgroundExecution",
      input: { target: { command: "npm run dev" }, context: { dryRun: false, guard: { allowed: true } } },
      executor: {
        shell: {
          async startBackground(request) {
            return { ok: true as const, output: { backgroundHandle: request.jobId, pid: 501 } };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
    {
      toolId: "shell.detachedExecution",
      input: {
        target: { command: "node server.js" },
        context: { dryRun: false, guard: { allowed: true }, approval: { accepted: true } },
      },
      executor: {
        shell: {
          async startDetached(request) {
            return { ok: true as const, output: { detachedHandle: request.launchId, pid: 502 } };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
    {
      toolId: "shell.foregroundExecution",
      input: { target: { command: "printf ok" }, context: { dryRun: false, guard: { allowed: true } } },
      executor: {
        shell: {
          async run() {
            return { ok: true as const, output: { exitCode: 0, stdout: "ok", stderr: "" } };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
    {
      toolId: "shell.processSpawning",
      input: { target: { executable: "node", args: ["--version"] }, context: { dryRun: false, guard: { allowed: true } } },
      executor: {
        shell: {
          async spawnProcess(request) {
            return { ok: true as const, output: { spawnHandle: `spawn:${request.launchMode}`, pid: 503 } };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
    {
      toolId: "shell.processTermination",
      input: { target: { processId: 503, signal: "SIGTERM" }, context: { dryRun: false, guard: { allowed: true } } },
      executor: {
        shell: {
          async terminateProcess(request) {
            return { ok: true as const, output: { processId: request.processId, signal: request.signal, force: request.force } };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
    {
      toolId: "shell.serviceStartAndVerify",
      input: {
        target: { command: "npm run dev", verification: { kind: "http", url: "http://127.0.0.1:3000/" } },
        context: { dryRun: false, guard: { allowed: true }, approval: { accepted: true } },
      },
      executor: {
        shell: {
          async startServiceAndVerify(request) {
            return {
              ok: true as const,
              output: {
                serviceHandle: request.start.serviceId,
                status: "healthy",
                statusSnapshot: {
                  handle: request.start.serviceId,
                  lifecycleKind: "service",
                  processState: "running",
                  verificationState: "verified",
                  verified: true,
                },
              },
            };
          },
        },
      } satisfies BaseToolExecutorPort,
    },
  ];

  for (const testCase of cases) {
    const lookup = registry.lookupHandler(testCase.toolId);
    assert.equal(lookup.ok, true);
    if (!lookup.ok) throw new Error(`${testCase.toolId} handler should be registered`);

    const result = await lookup.handler.invoke({
      toolCallId: `call:${testCase.toolId}`,
      runtimeId: "runtime-1",
      sessionId: "session-1",
      input: testCase.input,
      executor: testCase.executor,
    });

    assert.equal(result.ok, true, testCase.toolId);
    if (!result.ok) throw new Error(`${testCase.toolId} registry handler invocation should succeed`);
    assert.equal((result.output as { providerCalled?: boolean }).providerCalled, true);
  }
});

test("processControl real execution can call host runtime process ports", async () => {
  const calls: string[] = [];
  const executor: BaseToolExecutorPort = {
    shell: {
      async run(request) {
        calls.push(`run:${request.command}`);
        return { ok: true, output: { exitCode: 0, stdout: "ok", stderr: "" } };
      },
      async startBackground(request) {
        calls.push(`background:${request.jobId}`);
        return { ok: true, output: { backgroundHandle: request.jobId, pid: 201 } };
      },
      async startDetached(request) {
        calls.push(`detached:${request.launchId}`);
        return { ok: true, output: { detachedHandle: request.launchId, pid: 202 } };
      },
      async spawnProcess(request) {
        calls.push(`spawn:${request.launchMode}`);
        return { ok: true, output: { spawnHandle: "spawn-host", pid: 203 } };
      },
      async terminateProcess(request) {
        calls.push(`terminate:${request.processId}:${request.signal}`);
        return { ok: true, output: { operation: "terminate-process", processId: request.processId, signal: request.signal, force: request.force } };
      },
      async startServiceAndVerify(request) {
        calls.push(`service:${request.start.serviceId}:${request.verification.kind}`);
        return {
          ok: true,
          output: {
            serviceHandle: request.start.serviceId,
            status: "healthy",
            statusSnapshot: {
              handle: request.start.serviceId,
              lifecycleKind: "service",
              processState: "running",
              verificationState: "verified",
              verified: true,
            },
          },
        };
      },
    },
  };

  const context = { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } };

  const background = await executeShellBackgroundExecution({
    target: { command: "npm run dev", jobId: "dev-server" },
    context,
    executor,
  });
  assert.equal(background.ok, true);
  if (!background.ok) throw new Error("background host port should succeed");
  assert.equal(background.output.resultEnvelope.backgroundHandle, "dev-server");
  assert.equal(background.output.resultEnvelope.serviceStatus, "started");
  assert.equal(background.output.resultEnvelope.verificationStatus, "unverified");
  assert.equal(
    (background.output.resultEnvelope.serviceLifecycle as { nextRequiredAction?: string } | undefined)?.nextRequiredAction,
    "verify",
  );

  const detached = await executeShellDetachedExecution({
    target: { command: "node server.js", launchId: "server" },
    context: { ...context, approval: { accepted: true } },
    executor,
  });
  assert.equal(detached.ok, true);
  if (!detached.ok) throw new Error("detached host port should succeed");
  assert.equal(detached.output.resultEnvelope.serviceStatus, "started");
  assert.equal(detached.output.resultEnvelope.verificationStatus, "unverified");

  const foreground = await executeShellForegroundExecution({
    target: { command: "printf ok" },
    context,
    executor,
  });
  assert.equal(foreground.ok, true);

  const spawn = await executeShellProcessSpawning({
    target: { executable: "node", args: ["--version"] },
    launchMode: "background",
    context,
    executor,
  });
  assert.equal(spawn.ok, true);
  if (!spawn.ok) throw new Error("spawn host port should succeed");
  assert.equal(spawn.output.resultEnvelope.serviceStatus, "started");
  assert.equal(spawn.output.resultEnvelope.verificationStatus, "unverified");

  const terminate = await executeShellProcessTermination({
    target: { processId: 203, signal: "SIGTERM" },
    context,
    executor,
  });
  assert.equal(terminate.ok, true);

  const service = await executeShellServiceStartAndVerify({
    target: { command: "npm run dev", serviceId: "dev-service", verification: { kind: "http", url: "http://127.0.0.1:3000/" } },
    context,
    executor,
  });
  assert.equal(service.ok, true);

  assert.deepEqual(calls, [
    "background:dev-server",
    "detached:server",
    "run:sh",
    "spawn:background",
    "terminate:203:SIGTERM",
    "service:dev-service:http",
  ]);
});
