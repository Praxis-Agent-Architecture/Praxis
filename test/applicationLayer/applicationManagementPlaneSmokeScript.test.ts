import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationManagementPlaneSmoke,
} from "../../examples/scripts/runtime_application_management_plane_smoke.js";

test("application management plane smoke exposes a dry-run control surface bundle", async () => {
  const result = await runApplicationManagementPlaneSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "ready");
  assert.equal(result.view.counters.turns, 0);
  assert.equal(result.managementPlane.applicationCommandKind, "praxis.application.managementPlane");
  assert.equal(result.managementPlane.publicSafe, true);
  assert.equal(result.managementPlane.resultOk, true);
  assert.equal(result.managementPlane.route, "runtime.managementPlane");
  assert.equal(result.managementPlane.dryRun, true);
  assert.equal(result.managementPlane.unsafeSideEffects, false);
  assert.equal(result.managementPlane.totalComponents, 8);
  assert.equal(result.managementPlane.readyComponents, 8);
  assert.deepEqual(result.managementPlane.surfaces, [
    "accessSession",
    "operatorConsole",
    "commandRouter",
    "policyGate",
    "resourceGovernor",
    "mutationPlanner",
    "rollbackController",
    "governanceBridge",
  ]);
  assert.equal(result.managementPlane.readyComponentIds.length, 8);
  assert.equal(result.managementPlane.grantedScopes.includes("runtime.read"), true);
  assert.equal(result.managementPlane.grantedScopes.includes("runtime.inspect"), true);
  assert.equal(result.managementPlane.events.includes("runtime.managementPlane.ready"), true);
  assert.equal(result.subplanes.accessSessionOk, true);
  assert.equal(result.subplanes.operatorConsoleOk, true);
  assert.equal(result.subplanes.policyGateOk, true);
  assert.equal(result.subplanes.commandRouterOk, true);
  assert.equal(result.subplanes.resourceGovernorOk, true);
  assert.equal(result.subplanes.mutationPlannerOk, true);
  assert.equal(result.subplanes.rollbackPlanOk, true);
  assert.equal(result.subplanes.governanceBridgeOk, true);
  assert.equal(result.subplanes.governanceBridgeStatus, "ready");
});
