import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationSqliteSmoke,
} from "../../examples/scripts/runtime_application_sqlite_smoke.js";

test("application SQLite smoke persists runtime session event records through the application facade", async () => {
  const result = await runApplicationSqliteSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application sqlite smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 1);
  assert.equal(result.persistence.sqliteExists, true);
  assert.equal(result.persistence.snapshot.sessionStatus, "completed");
  assert.equal(result.persistence.snapshot.storageWorkspaceRef, "rax.workspace");
  assert.equal(result.persistence.snapshot.eventCount, result.persistence.sqliteTableCounts.events);
  assert.equal(result.persistence.snapshot.mainLoopStepCount, result.persistence.sqliteTableCounts.mainLoopSteps);
  assert.equal(result.persistence.snapshot.invocationCount, result.persistence.sqliteTableCounts.invocations);
  assert.equal(result.persistence.snapshot.includesSessionCreated, true);
  assert.equal(result.persistence.snapshot.includesFinalOutput, true);
  assert.equal(result.persistence.snapshot.includesModelInvocation, true);
  assert.equal(result.persistence.snapshot.includesPromptLoweringStep, true);
  assert.equal(result.persistence.snapshot.publicSafeErrors, 0);
  assert.equal(result.timeline.status, "ok");
  assert.equal(result.timeline.sourceKind, "sqlite");
  assert.equal(result.timeline.hasRuntimeEvents, true);
  assert.equal(result.timeline.hasInvocations, true);
  assert.equal(result.timeline.hasMainLoopSteps, true);
  assert.equal(result.timeline.includesSessionCreated, true);
  assert.equal(result.timeline.includesFinalOutput, true);
  assert.equal(result.timeline.includesModelInvocation, true);
  assert.equal(result.timeline.includesPromptLoweringStep, true);
  assert.equal(result.timeline.timelineItems, result.timeline.expectedTimelineItems);
});
