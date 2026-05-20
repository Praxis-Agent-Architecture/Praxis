import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

class RuntimeOwnedExecutionObservationHarness {
  readonly executionId = "real-execution-monitoring-1";
  readonly command = "node -e monitor-ok";
  readonly startedAtMs = Date.now();
  readonly process: ChildProcessWithoutNullStreams;

  stdoutBytes = 0;
  stderrBytes = 0;
  lastActivityAtMs = this.startedAtMs;
  exitCode: number | undefined;
  signal: string | undefined;

  constructor() {
    this.process = spawn(process.execPath, [
      "-e",
      [
        "process.stdout.write('monitor-ok\\n');",
        "setTimeout(() => process.exit(0), 10);",
      ].join("\n"),
    ]);

    this.process.stdout.on("data", (chunk: Buffer) => {
      this.lastActivityAtMs = Date.now();
      this.stdoutBytes += Buffer.byteLength(chunk);
    });
    this.process.stderr.on("data", (chunk: Buffer) => {
      this.lastActivityAtMs = Date.now();
      this.stderrBytes += Buffer.byteLength(chunk);
    });
    this.process.on("exit", (code, signal) => {
      this.exitCode = code ?? undefined;
      this.signal = signal ?? undefined;
      this.lastActivityAtMs = Date.now();
    });
  }

  get executor(): BaseToolExecutorPort {
    return {
      shell: {
        monitorExecution: async ({ target }) => {
          assert.equal(target.executionId, this.executionId);
          const state = this.exitCode === undefined && this.signal === undefined ? "running" : "exited";
          return {
            ok: true,
            output: {
              target: {
                executionId: this.executionId,
                processId: this.process.pid,
              },
              observation: {
                state,
                startedAtMs: this.startedAtMs,
                observedAtMs: Date.now(),
                lastActivityAtMs: this.lastActivityAtMs,
                exitCode: this.exitCode,
                signal: this.signal,
                stdoutBytes: this.stdoutBytes,
                stderrBytes: this.stderrBytes,
              },
              health: state === "running" ? "healthy" : this.exitCode === 0 ? "completed" : "failed",
              command: this.command,
            },
          };
        },
      },
    };
  }

  async waitForExit(timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exitCode !== undefined || this.signal !== undefined) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("timed out waiting for monitored process exit");
  }

  cleanup(): void {
    if (this.exitCode === undefined && this.signal === undefined) this.process.kill("SIGTERM");
  }
}

async function invokeTool(toolId: string, input: unknown, executor: BaseToolExecutorPort) {
  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error(`missing handler ${toolId}`);

  const result = await lookup.handler.invoke({
    toolCallId: `${toolId}:real-smoke`,
    runtimeId: "runtime-real-execution-monitoring",
    sessionId: "agent-session-real-execution-monitoring",
    input,
    executor,
  });
  if (!result.ok) throw new Error(`${toolId} failed`);
  assert.equal(result.ok, true);
  return result;
}

test("executionMonitoring baseTools observe a real runtime-owned shell process through registry", async () => {
  const harness = new RuntimeOwnedExecutionObservationHarness();
  const context = {
    dryRun: false,
    guard: { allowed: true },
    grantedPermissions: ["shell:observe"],
  };

  try {
    await harness.waitForExit();

    const exit = await invokeTool(
      "shell.exitCodeChecking",
      { executionId: harness.executionId, context },
      harness.executor,
    );
    assert.equal((exit.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((exit.output as { dryRun: boolean }).dryRun, false);
    assert.equal((exit.output as { exitCode: number }).exitCode, 0);
    assert.equal((exit.output as { status: string }).status, "success");

    const processStatus = await invokeTool(
      "shell.processStatusTracking",
      { executionId: harness.executionId, expectedStatuses: ["completed"], context },
      harness.executor,
    );
    assert.equal((processStatus.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((processStatus.output as { status: string }).status, "completed");
    assert.equal((processStatus.output as { matchesExpectedStatus: boolean }).matchesExpectedStatus, true);
    assert.equal(typeof (processStatus.output as { pid?: number }).pid, "number");

    const runtimeObservation = await invokeTool(
      "shell.runtimeObservation",
      { executionId: harness.executionId, context },
      harness.executor,
    );
    assert.equal((runtimeObservation.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((runtimeObservation.output as { status: string }).status, "active");
    assert.equal((runtimeObservation.output as { latestEventType?: string }).latestEventType, "exit");
  } finally {
    harness.cleanup();
  }
});
