import assert from "node:assert/strict";
import { test } from "node:test";

import { createRuntimeBaseToolExecutorPort } from "./baseToolExecutorPortFactory.js";

function createTestExecutor() {
  return createRuntimeBaseToolExecutorPort({
    runtimeId: "runtime.detached.test",
    sessionId: "session.detached.test",
    policy: {
      workspaceRoot: process.cwd(),
      allowedRoots: [process.cwd()],
      allowProcessExecution: true,
      allowShellExecution: true,
    },
    resourceLimits: {
      timeoutMs: 2_000,
      maxOutputBytes: 16 * 1024,
    },
  });
}

test("detached shell launch fails when the process exits during startup", async () => {
  const executor = createTestExecutor();
  const result = await executor.shell?.startDetached?.({
    command: "exit 0",
    shell: "sh",
    cwd: process.cwd(),
    launchId: "quick-exit",
    restartPolicy: "none",
  });

  assert.ok(result);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error.message, /exited during startup/u);
  }
});

test("detached shell launch succeeds once the process survives startup", async () => {
  const executor = createTestExecutor();
  const result = await executor.shell?.startDetached?.({
    command: "sleep 2",
    shell: "sh",
    cwd: process.cwd(),
    launchId: "sleep-detached",
    restartPolicy: "none",
  });

  assert.ok(result);
  assert.equal(result.ok, true);
  if (result?.ok) {
    assert.equal(result.metadata?.detached, true);
    assert.match(String(result.output.stdout), /launched detached process/u);
  }
});
