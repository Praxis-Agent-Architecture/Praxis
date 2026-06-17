import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationKernelShellSmoke,
} from "../../examples/scripts/runtime_application_kernel_shell_smoke.js";

test("application kernel shell smoke records application-visible sandboxed tool evidence", async () => {
  const result = await runApplicationKernelShellSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application shell smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-kernel-shell-call");
  assert.equal(result.providerRoundTrip.outputIncludesStdout, true);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_shell_run");
  assert.equal(result.toolEvent.toolId, "shell.run");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.sandboxMode, "workspace-rollback");
  assert.equal(result.toolEvent.commandSandboxProviderFamily, "workspace-rollback");
  assert.equal(result.toolEvent.commandSandboxApplied, true);
  assert.equal(result.events.includes("tool:shell.run:completed"), true);
  assert.equal(result.events.includes("final"), true);
});
