import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationRewindSmoke,
} from "../../examples/scripts/runtime_application_rewind_smoke.js";

test("application rewind smoke restores conversation context before the next turn", async () => {
  const result = await runApplicationRewindSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.rewind.ok, true);
  assert.equal(result.rewind.eventId, "application.rewind.completed");
  assert.equal(result.rewind.targetTurnId, "turn.1");
  assert.deepEqual(result.rewind.removedTurnIds, ["turn.2"]);
  assert.equal(result.rewind.historyMessagesBefore, 6);
  assert.equal(result.rewind.historyMessagesAfter, 3);
  assert.equal(result.afterRewind.thirdProviderPromptIncludesFirstTurn, true);
  assert.equal(result.afterRewind.thirdProviderPromptIncludesSecondTurn, false);
  assert.equal(result.afterRewind.thirdProviderPromptIncludesCurrentTurn, true);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application rewind smoke final");
  assert.equal(result.view.counters.turns, 3);
  assert.equal(result.providerCalls, 3);
});
