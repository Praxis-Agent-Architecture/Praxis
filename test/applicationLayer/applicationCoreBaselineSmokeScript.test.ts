import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationCoreBaselineSmoke,
} from "../../examples/scripts/runtime_application_core_baseline_smoke.js";

test("application core baseline smoke drives repeated application sessions through the public facade", async () => {
  const result = await runApplicationCoreBaselineSmoke({
    rounds: 2,
    sessions: 3,
    concurrency: 2,
    maxTotalRssDeltaBytes: 1_000_000_000,
    maxTotalHeapUsedDeltaBytes: 1_000_000_000,
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.rounds.requested, 2);
  assert.equal(result.rounds.ok, 2);
  assert.equal(result.sessions.requestedPerRound, 3);
  assert.equal(result.sessions.ok, 6);
  assert.equal(result.sessions.failed, 0);
  assert.equal(result.providerCalls, 6);
  assert.equal(result.aggregate.turns, 6);
  assert.equal(result.aggregate.modelCalls, 6);
  assert.equal(result.aggregate.toolCalls, 0);
  assert.ok(result.aggregate.applicationEvents >= 6);
  assert.equal(result.totalMemoryBudget.status, "within-budget");
  assert.equal(result.roundResults.length, 2);
  assert.deepEqual(result.roundResults.map((round) => round.sessions.ok), [3, 3]);
  assert.ok(result.sampleSessionIds.includes("session.application.coreBaseline.round1.session0"));
});
