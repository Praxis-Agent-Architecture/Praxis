import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationSandboxSmoke,
} from "../../examples/scripts/runtime_application_sandbox_smoke.js";

test("application sandbox smoke inspects runtime sandbox mount matrix", async () => {
  const result = await runApplicationSandboxSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "idle");
  assert.equal(result.view.counters.turns, 0);
  assert.equal(result.sandboxMountMatrix.kind, "praxis.application.sandboxMountMatrix");
  assert.equal(result.sandboxMountMatrix.runtimeSurface, "runtime.sandboxPlane.mountMatrix");
  assert.equal(result.sandboxMountMatrix.providerFamily, "linux-bubblewrap");
  assert.equal(result.sandboxMountMatrix.providerPrepared, true);
  assert.equal(result.sandboxMountMatrix.commandPreviewExecutesCommand, false);
  assert.equal(result.sandboxMountMatrix.raxcellExpected, true);
  assert.equal(result.sandboxMountMatrix.raxcellPolicyOwner, "praxis");
  assert.equal(result.sandboxMountMatrix.raxcellProviderRole, "environment-and-execution");
  assert.equal(result.sandboxMountMatrix.policyMiddlewareMounted, true);
  assert.equal(result.sandboxMountMatrix.falseReadyGuards.strongSandboxRequiresReadyProvider, true);
  assert.equal(result.sandboxMountMatrix.falseReadyGuards.commandPreviewDoesNotExecute, true);
  assert.equal(result.sandboxMountMatrix.publicSafe, true);
});
