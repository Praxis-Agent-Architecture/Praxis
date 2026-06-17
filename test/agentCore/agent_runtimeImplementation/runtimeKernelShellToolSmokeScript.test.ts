import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeKernelShellToolSmoke,
} from "../../../examples/scripts/runtime_kernel_shell_tool_smoke.js";

test("runtime kernel shell tool smoke records sandboxed shell result and session evidence", async () => {
  const result = await runRuntimeKernelShellToolSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.modelCalls, 2);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.toolCalls.total, 1);
  assert.equal(result.toolCalls.ok, 1);
  assert.equal(result.toolCalls.toolIds.includes("shell.run"), true);
  assert.equal(result.shell.exitCode, 0);
  assert.match(result.shell.stdout, /kernel-shell-ok/u);
  assert.equal(result.shell.sandboxMode, "workspace-rollback");
  assert.equal(result.shell.sandboxDeclaredProviderFamily, "host-observed");
  assert.equal(result.shell.sandboxPlanStatus, "ready");
  assert.equal(result.shell.commandSandboxProviderFamily, "workspace-rollback");
  assert.equal(result.shell.commandSandboxMode, "workspace-rollback");
  assert.equal(result.shell.commandSandboxApplied, true);
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "kernel-shell-smoke-call");
  assert.equal(result.providerRoundTrip.outputIncludesStdout, true);
  assert.equal(result.providerRoundTrip.secondProviderInputItems > 0, true);
  assert.equal(result.session.status, "completed");
  assert.equal(result.session.invocations.tool, 1);
  assert.equal(result.session.events.includes("runtime.sandboxPlane.prepared"), true);
  assert.equal(result.session.mainLoopActions.includes("invokeBaseTool"), true);
  assert.equal(result.session.checkpointActions.includes("buildCachePlan"), true);
});
