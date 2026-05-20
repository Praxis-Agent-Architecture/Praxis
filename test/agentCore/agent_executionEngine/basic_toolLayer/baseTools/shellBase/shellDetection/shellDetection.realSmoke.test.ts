import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { shellCapabilityDetectionHandler } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.capabilityDetection.js";
import { shellEnvironmentInspectionHandler } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.environmentInspection.js";
import { shellSessionDetectionHandler } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.sessionDetection.js";
import { shellTypeDetectionHandler } from "../../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/shellBase/shellDetection/shell.typeDetection.js";

const execFileAsync = promisify(execFile);

const localShellExecutor: BaseToolExecutorPort = {
  shell: {
    run: async ({ command, args = [], cwd, timeoutMs }) => {
      try {
        const result = await execFileAsync(command, [...args], {
          cwd,
          timeout: timeoutMs,
        });
        return {
          ok: true,
          output: {
            exitCode: 0,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        };
      } catch (error) {
        const failure = error as { code?: string; message?: string; stdout?: string; stderr?: string };
        return {
          ok: false,
          error: {
            code: failure.code ?? "EXEC_FILE_FAILED",
            message: failure.message ?? "execFile failed",
            publicSafe: true,
          },
        };
      }
    },
  },
};

test("shellDetection handlers can run harmless real probe scripts through a runtime-supplied executor", async () => {
  const capability = await shellCapabilityDetectionHandler.invoke({
    toolCallId: "real-smoke-capability",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/sh", requestedCapabilities: ["command-execution", "pipeline"] },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: localShellExecutor,
  });

  assert.equal(capability.ok, true);
  if (capability.ok) {
    assert.equal(capability.output.dryRun, false);
    assert.equal(capability.output.findings.length, 2);
  }

  const environment = await shellEnvironmentInspectionHandler.invoke({
    toolCallId: "real-smoke-env",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { workingDirectory: process.cwd(), variablesToInspect: ["PATH"] },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: localShellExecutor,
  });

  assert.equal(environment.ok, true);
  if (environment.ok) {
    assert.equal(environment.output.dryRun, false);
    assert.equal(environment.output.variables[0]?.name, "PATH");
  }

  const session = await shellSessionDetectionHandler.invoke({
    toolCallId: "real-smoke-session",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      target: { shellExecutable: "/bin/sh" },
      context: { dryRun: false, guard: { allowed: true } },
    },
    executor: localShellExecutor,
  });

  assert.equal(session.ok, true);
  if (session.ok) {
    assert.equal(session.output.dryRun, false);
    assert.equal(session.output.detected.shellKind, "sh");
  }

  const type = await shellTypeDetectionHandler.invoke({
    toolCallId: "real-smoke-type",
    runtimeId: "runtime-1",
    sessionId: "session-1",
    input: {
      shellPath: "/bin/sh",
      context: { runtimeId: "runtime-1", dryRun: false, guard: { allowed: true } },
    },
    executor: localShellExecutor,
  });

  assert.equal(type.ok, true);
  if (type.ok) {
    assert.equal(type.output.dryRun, false);
    assert.equal(type.output.dispatch, "provider");
    assert.deepEqual(type.output.requiredPermissions, ["shell:detect"]);
    assert.equal(type.output.detectedType, "sh");
  }
});
