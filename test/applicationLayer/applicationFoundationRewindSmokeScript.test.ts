import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationFoundationRewindSmoke,
} from "../../examples/scripts/runtime_application_foundation_rewind_smoke.js";

test("application foundation rewind smoke forks durable session facts", async () => {
  const result = await runApplicationFoundationRewindSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.rewind.ok, true);
  assert.equal(result.rewind.eventId, "application.rewind.completed");
  assert.equal(result.rewind.targetTurnId, "turn.1");
  assert.deepEqual(result.rewind.removedTurnIds, ["turn.2"]);
  assert.equal(result.rewind.sourceSessionId, "session.application.foundation-rewind-smoke");
  assert.notEqual(result.rewind.targetSessionId, undefined);
  assert.notEqual(result.rewind.targetSessionId, result.rewind.sourceSessionId);
  assert.equal(result.rewind.foundationForked, true);
  assert.equal(result.view.sessionId, result.rewind.targetSessionId);
  assert.deepEqual(result.foundation.sourceTurnIds, ["turn.1", "turn.2"]);
  assert.deepEqual(result.foundation.forkTurnIds, ["turn.1", "turn.3"]);
  assert.equal(result.foundation.sourceKeepsSecondTurn, true);
  assert.equal(result.foundation.forkKeepsFirstTurn, true);
  assert.equal(result.foundation.forkDropsSecondTurn, true);
  assert.equal(result.foundation.forkKeepsThirdTurn, true);
  assert.equal(result.timeline.status, "ok");
  assert.equal(result.timeline.sourceKind, "foundation-memory");
  assert.equal(result.timeline.hasFoundationSession, true);
  assert.equal(result.timeline.hasCheckpoints, true);
  assert.equal(result.timeline.hasSessionForks, true);
  assert.equal(result.timeline.checkpointCount, 2);
  assert.equal(result.timeline.sessionForkCount, 1);
  assert.deepEqual(result.timeline.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.equal(result.timeline.sourceSessionId, result.rewind.sourceSessionId);
  assert.equal(result.timeline.targetSessionId, result.rewind.targetSessionId);
  assert.equal(result.timeline.forkedFromTurnId, "turn.1");
  assert.equal(result.sessionReport.status, "ok");
  assert.equal(result.sessionReport.applicationCommandKind, "praxis.application.sessionReport");
  assert.equal(result.sessionReport.publicSafe, true);
  assert.equal(result.sessionReport.applicationSessionId, result.rewind.targetSessionId);
  assert.equal(result.sessionReport.sourceKind, "foundation-memory");
  assert.equal(result.sessionReport.hasSession, true);
  assert.equal(result.sessionReport.hasForkRelation, true);
  assert.equal(result.sessionReport.hasCopiedConversation, true);
  assert.equal(result.sessionReport.turns, 2);
  assert.equal(result.sessionReport.messages, result.foundation.forkMessageCount);
  assert.equal(result.sessionReport.copiedMessages >= 2, true);
  assert.deepEqual(result.sessionReport.checkpointTurnIds, ["turn.1", "turn.3"]);
  assert.equal(result.sessionReport.sourceSessionId, result.rewind.sourceSessionId);
  assert.equal(result.sessionReport.targetSessionId, result.rewind.targetSessionId);
  assert.equal(result.sessionReport.forkedFromTurnId, "turn.1");
  assert.equal(result.sessionReport.forkKind, "rewind");
  assert.equal(result.sessionReport.messageTurnIdsKnown, true);
  assert.equal(result.sessionReport.forkSourceRecorded, true);
  assert.equal(result.timelineQuery.status, "ok");
  assert.equal(result.timelineQuery.indexTotalItems > 0, true);
  assert.equal(result.timelineQuery.checkpointItems, 2);
  assert.equal(result.timelineQuery.turnOneItems >= 2, true);
  assert.equal(result.timelineQuery.sessionForkRefs >= 1, true);
  assert.equal(result.timelineQuery.replayStatus, "ready");
  assert.equal(result.timelineQuery.replayMode, "read-only-plan");
  assert.equal(result.timelineQuery.replayRequiresExecution, "none");
  assert.equal(
    result.timelineQuery.replayItemIds.includes(`checkpoint:${result.rewind.targetSessionId}:turn.1`),
    true,
  );
  assert.equal(result.afterRewind.thirdProviderPromptIncludesFirstTurn, true);
  assert.equal(result.afterRewind.thirdProviderPromptIncludesSecondTurn, false);
  assert.equal(result.afterRewind.thirdProviderPromptIncludesCurrentTurn, true);
  assert.equal(result.providerCalls, 3);
});
