import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationFoundationSmoke,
} from "../../examples/scripts/runtime_application_foundation_smoke.js";

test("application foundation smoke persists turn checkpoints and conversation messages", async () => {
  const result = await runApplicationFoundationSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.finalOutput, "application foundation smoke completed");
  assert.equal(result.view.counters.turns, 1);
  assert.equal(result.view.startedBeforeSubmit, false);
  assert.equal(result.providerCalls, 1);
  assert.equal(result.foundation.sessionPresent, true);
  assert.equal(result.foundation.sessionSource, "application.submitTurn");
  assert.equal(result.foundation.turnCount, 1);
  assert.equal(result.foundation.firstTurnId, "turn.1");
  assert.equal(result.foundation.checkpoint, true);
  assert.equal(result.foundation.includesUserMessage, true);
  assert.equal(result.foundation.includesAssistantMessage, true);
});
