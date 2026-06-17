import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationTimelineSmoke,
} from "../../examples/scripts/runtime_application_timeline_smoke.js";

test("application timeline smoke retains queryable events and streams live events", async () => {
  const result = await runApplicationTimelineSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application timeline smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.counters.modelCalls, 2);
  assert.equal(result.view.counters.toolCalls, 1);
  assert.equal(result.timeline.retainedEventCount, result.timeline.localViewEventCount);
  assert.equal(result.timeline.retainedEventCount, result.timeline.restViewEventCount);
  assert.equal(result.timeline.sameEventIdsInLocalAndRest, true);
  assert.equal(result.timeline.ordered, true);
  assert.equal(result.timeline.includesSubmitted, true);
  assert.equal(result.timeline.includesManifestReady, true);
  assert.equal(result.timeline.includesModelProgress, true);
  assert.equal(result.timeline.includesToolCompleted, true);
  assert.equal(result.timeline.includesFinal, true);
  assert.equal(result.timeline.applicationReport.applicationCommandKind, "praxis.application.timelineReport");
  assert.equal(result.timeline.applicationReport.reportStatus, "ok");
  assert.equal(result.timeline.applicationReport.sourceKind, "application-memory");
  assert.equal(result.timeline.applicationReport.timelineItems, result.timeline.applicationReport.indexTotalItems);
  assert.ok(result.timeline.applicationReport.queryReturnedItems >= 3);
  assert.ok(result.timeline.applicationReport.eventItems >= 2);
  assert.ok(result.timeline.applicationReport.invocationItems >= 1);
  assert.ok(result.timeline.applicationReport.mainLoopStepItems >= 1);
  assert.equal(result.timeline.applicationReport.hasRuntimeEvents, true);
  assert.equal(result.timeline.applicationReport.hasInvocations, true);
  assert.equal(result.timeline.applicationReport.hasMainLoopSteps, true);
  assert.equal(result.timeline.applicationReport.replayStatus, "unavailable");
  assert.equal(result.timeline.applicationReport.replayMode, "read-only-plan");
  assert.equal(result.timeline.applicationReport.replayRequiresExecution, "none");
  assert.equal(result.timeline.applicationReport.publicSafe, true);
  assert.equal(result.timeline.modelFleetMetadata.localModelEventCount, 3);
  assert.equal(result.timeline.modelFleetMetadata.restModelEventCount, 3);
  assert.equal(result.timeline.modelFleetMetadata.streamModelEventCount, 3);
  assert.equal(result.timeline.modelFleetMetadata.webSocketModelEventCount, 3);
  assert.equal(result.timeline.modelFleetMetadata.sameModelEventIdsInLocalRestStreamAndWebSocket, true);
  assert.equal(result.timeline.modelFleetMetadata.retryableFailurePreservedEverywhere, true);
  assert.equal(result.timeline.modelFleetMetadata.fallbackPreservedEverywhere, true);
  assert.deepEqual(result.timeline.modelFleetMetadata.failureCodes, ["PROVIDER_RATE_LIMITED"]);
  assert.deepEqual(result.timeline.modelFleetMetadata.endpointRefs, ["fallback", "primary"]);
  assert.deepEqual(result.timeline.modelFleetMetadata.fallbackFromRefs, ["primary"]);
  assert.equal(result.timeline.finalEvent.publicSafe, true);
  assert.equal(result.timeline.finalEvent.kind, "final");
  assert.equal(result.timeline.finalEvent.status, "completed");
  assert.equal(result.timeline.finalEvent.turnId, "turn.1");
  assert.equal(result.timeline.toolEvent.toolId, "shell.run");
  assert.equal(result.timeline.toolEvent.toolStatus, "completed");
  assert.equal(result.stream.sawInitialView, true);
  assert.equal(result.stream.sawSubmitted, true);
  assert.equal(result.stream.sawToolCompleted, true);
  assert.equal(result.stream.sawFinal, true);
});
