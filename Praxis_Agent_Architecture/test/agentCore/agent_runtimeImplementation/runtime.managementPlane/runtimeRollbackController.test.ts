import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import assert from "node:assert/strict";
import test from "node:test";

import { planRuntimeRollback } from "../../../../src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeRollbackController.js";

defineAgentCoreContractTest({
  sourcePath: "Praxis_Agent_Architecture/src/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeRollbackController.ts",
  docPath: "Praxis_Agent_Architecture/docs/agentCore/agent_runtimeImplementation/runtime.managementPlane/runtimeRollbackController.md",
  testFileUrl: import.meta.url,
});

test("planRuntimeRollback creates a governed dry-run rollback plan", () => {
  const result = planRuntimeRollback({
    runtimeId: " runtime-1 ",
    currentRevision: 8,
    targetCheckpoint: {
      checkpointId: " checkpoint-4 ",
      revision: 4,
      label: " before policy change ",
      createdBy: " operator-console ",
    },
    allowedCheckpointIds: ["checkpoint-2", "checkpoint-4", "checkpoint-4"],
    reason: " operator requested rollback ",
    contract: { accepted: true },
    governance: { accepted: true },
    trace: { correlationId: " corr-1 ", operatorId: " op-1 " },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.plan.runtimeId, "runtime-1");
  assert.equal(result.plan.fromRevision, 8);
  assert.equal(result.plan.toRevision, 4);
  assert.equal(result.plan.checkpoint.checkpointId, "checkpoint-4");
  assert.equal(result.plan.reason, "operator requested rollback");
  assert.equal(result.plan.controller, "runtime.managementPlane.rollbackController");
  assert.equal(result.plan.dispatch, "dry-run");
  assert.equal(result.plan.unsafeSideEffects, false);
  assert.equal(result.plan.reversible, true);
  assert.equal(result.plan.audit.requiresGovernance, true);
  assert.equal(result.plan.audit.contractChecked, true);
  assert.equal(result.plan.audit.governanceChecked, true);
  assert.deepEqual(result.events, ["runtime.managementPlane.rollback.planned"]);
});

test("planRuntimeRollback rejects unsafe or inconsistent rollback boundaries", () => {
  const missingCheckpoint = planRuntimeRollback({
    runtimeId: "runtime-1",
    currentRevision: 8,
  });

  assert.equal(missingCheckpoint.ok, false);
  assert.equal(missingCheckpoint.error.code, "MISSING_TARGET_CHECKPOINT");
  assert.equal(missingCheckpoint.error.boundary, "input");

  const outOfScope = planRuntimeRollback({
    runtimeId: "runtime-1",
    currentRevision: 8,
    targetCheckpoint: { checkpointId: "checkpoint-4", revision: 4 },
    allowedCheckpointIds: ["checkpoint-2"],
  });

  assert.equal(outOfScope.ok, false);
  assert.equal(outOfScope.error.code, "CHECKPOINT_OUT_OF_SCOPE");
  assert.equal(outOfScope.error.boundary, "scope");

  const targetAhead = planRuntimeRollback({
    runtimeId: "runtime-1",
    currentRevision: 4,
    targetCheckpoint: { checkpointId: "checkpoint-9", revision: 9 },
  });

  assert.equal(targetAhead.ok, false);
  assert.equal(targetAhead.error.code, "TARGET_AHEAD_OF_CURRENT");
  assert.equal(targetAhead.error.boundary, "runtime-state");
  assert.equal(targetAhead.error.stateSafe, true);

  const governanceRejected = planRuntimeRollback({
    runtimeId: "runtime-1",
    currentRevision: 8,
    targetCheckpoint: { checkpointId: "checkpoint-4", revision: 4 },
    governance: { accepted: false, reason: "operator lacks rollback scope" },
  });

  assert.equal(governanceRejected.ok, false);
  assert.equal(governanceRejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(governanceRejected.error.boundary, "governance");
  assert.equal(governanceRejected.error.internalDetailExposed, false);
});
