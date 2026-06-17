import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeSandboxShellSmoke,
} from "../../../examples/scripts/runtime_sandbox_shell_smoke.js";

test("runtime sandbox shell smoke proves rollback and injected provider shell paths", async () => {
  const result = await runRuntimeSandboxShellSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.workspaceRollback.ok, true);
  assert.equal(result.workspaceRollback.exitCode, 2);
  assert.equal(result.workspaceRollback.fileRestored, true);
  assert.equal(result.workspaceRollback.providerFamily, "workspace-rollback");
  assert.equal(result.workspaceRollback.rollbackProtects.includes("workspace-files"), true);
  assert.equal(result.injectedProvider.ok, true);
  assert.equal(result.injectedProvider.providerFamily, "linux-bubblewrap");
  assert.equal(result.injectedProvider.evidenceStatus, "injected");
  assert.equal(result.injectedProvider.prepareRunCalls, 1);
  assert.equal(result.injectedProvider.runCalls, 1);
  assert.equal(result.injectedProvider.exitCode, 0);
  assert.match(result.injectedProvider.stdout, /provider-ok/u);
});
