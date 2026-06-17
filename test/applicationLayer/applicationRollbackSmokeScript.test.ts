import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationRollbackSmoke,
} from "../../examples/scripts/runtime_application_rollback_smoke.js";

test("application rollback smoke restores failed shell writes through workspace rollback", async () => {
  const result = await runApplicationRollbackSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application rollback smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.providerToolExposure.exposesExpectedTool, true);
  assert.equal(result.providerToolExposure.expectedProviderName, "praxis_tool_shell_run");
  assert.equal(result.providerRoundTrip.toolOutputFedBack, true);
  assert.equal(result.providerRoundTrip.callId, "application-rollback-smoke-call");
  assert.equal(result.providerRoundTrip.outputIncludesExitCode, true);
  assert.equal(result.rollback.exitCode, 2);
  assert.equal(result.rollback.fileRestored, true);
  assert.equal(result.rollback.beforeText, "before\n");
  assert.equal(result.rollback.afterText, "before\n");
  assert.equal(result.toolEvent.toolId, "shell.run");
  assert.equal(result.toolEvent.toolStatus, "completed");
  assert.equal(result.toolEvent.sandboxMode, "workspace-rollback");
  assert.equal(result.toolEvent.commandSandboxProviderFamily, "workspace-rollback");
  assert.equal(result.toolEvent.commandSandboxApplied, true);
  assert.equal(result.toolEvent.workspaceRollbackRequired, true);
  assert.equal(result.toolEvent.workspaceRollbackRestored, true);
  assert.equal(result.toolEvent.workspaceRollbackChangedFiles, 1);
  assert.equal(result.events.includes("tool:shell.run:completed"), true);
  assert.equal(result.events.includes("final"), true);
});
