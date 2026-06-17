import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeTimelineSmoke,
} from "../../../examples/scripts/runtime_timeline_smoke.js";

test("runtime timeline smoke reads durable SQLite session evidence", async () => {
  const result = await runRuntimeTimelineSmoke({
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.sourceKind, "sqlite");
  assert.equal(result.hasRuntimeEvents, true);
  assert.equal(result.hasInvocations, true);
  assert.equal(result.hasMainLoopSteps, true);
  assert.equal(result.includesSessionCreated, true);
  assert.equal(result.includesFinalOutput, true);
  assert.equal(result.includesModelInvocation, true);
  assert.equal(result.includesPromptLoweringStep, true);
  assert.equal(result.timelineItems, result.expectedTimelineItems);
  assert.equal(result.checkpoint.status, "ok");
  assert.equal(result.checkpoint.sourceKind, "foundation-memory");
  assert.equal(result.checkpoint.hasFoundationSession, true);
  assert.equal(result.checkpoint.hasCheckpoints, true);
  assert.equal(result.checkpoint.hasSessionForks, true);
  assert.equal(result.checkpoint.checkpointCount, 2);
  assert.equal(result.checkpoint.sessionForkCount, 1);
  assert.deepEqual(result.checkpoint.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.equal(result.checkpoint.forkedFromTurnId, "turn.1");
  assert.equal(result.query.indexTotalItems > 0, true);
  assert.equal(result.query.checkpointItems, 2);
  assert.equal(result.query.turnOneItems >= 2, true);
  assert.equal(result.query.sessionForkRefs >= 1, true);
  assert.equal(result.query.replayStatus, "ready");
  assert.equal(result.query.replayMode, "read-only-plan");
  assert.equal(result.query.replayRequiresExecution, "none");
  assert.equal(result.query.replayItemIds.some((itemId) => itemId.endsWith(":turn.1")), true);
});
