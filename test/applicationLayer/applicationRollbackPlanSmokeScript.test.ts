import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationRollbackPlanSmoke,
} from "../../examples/scripts/runtime_application_rollback_plan_smoke.js";

test("application rollback plan smoke exposes governed dry-run rollback planning", async () => {
  const result = await runApplicationRollbackPlanSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.counters.turns, 2);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.rollbackPlan.applicationCommandKind, "praxis.application.rollbackPlan");
  assert.equal(result.rollbackPlan.publicSafe, true);
  assert.equal(result.rollbackPlan.checkpointTurnId, "turn.1");
  assert.equal(result.rollbackPlan.currentRevision, 2);
  assert.equal(result.rollbackPlan.allowedCheckpointIds.includes("turn.1"), true);
  assert.equal(result.rollbackPlan.allowedCheckpointIds.includes("turn.2"), true);
  assert.equal(result.rollbackPlan.resultOk, true);
  assert.equal(result.rollbackPlan.fromRevision, 2);
  assert.equal(result.rollbackPlan.toRevision, 1);
  assert.equal(result.rollbackPlan.checkpointId, "turn.1");
  assert.equal(result.rollbackPlan.controller, "runtime.managementPlane.rollbackController");
  assert.equal(result.rollbackPlan.dispatch, "dry-run");
  assert.equal(result.rollbackPlan.unsafeSideEffects, false);
  assert.equal(result.rollbackPlan.reversible, true);
  assert.equal(result.rollbackPlan.requiresGovernance, true);
  assert.equal(result.rollbackPlan.contractChecked, true);
  assert.equal(result.rollbackPlan.governanceChecked, true);
  assert.equal(result.rollbackPlan.events.includes("runtime.managementPlane.rollback.planned"), true);
  assert.equal(result.rejectedPlan.applicationCommandKind, "praxis.application.rollbackPlan");
  assert.equal(result.rejectedPlan.publicSafe, true);
  assert.equal(result.rejectedPlan.resultOk, false);
  assert.equal(result.rejectedPlan.errorCode, "MISSING_TARGET_CHECKPOINT");
  assert.equal(result.rejectedPlan.errorBoundary, "input");
  assert.equal(result.rejectedPlan.stateSafe, true);
  assert.equal(result.rejectedPlan.internalDetailExposed, false);
  assert.equal(result.rejectedPlan.events.includes("runtime.managementPlane.rollback.rejected"), true);
});
