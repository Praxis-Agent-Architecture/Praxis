import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimeCoreAcceptanceSuite,
} from "../../../examples/scripts/runtime_core_acceptance_suite.js";

test("runtime core acceptance suite combines runtime and application baseline evidence", async () => {
  const result = await runRuntimeCoreAcceptanceSuite({
    runtime: {
      rounds: 2,
      sessions: 2,
      concurrency: 1,
      memoryBudget: {
        maxRssDeltaBytes: 1_000_000_000,
        maxHeapUsedDeltaBytes: 1_000_000_000,
      },
      totalMemoryBudget: {
        maxRssDeltaBytes: 1_000_000_000,
        maxHeapUsedDeltaBytes: 1_000_000_000,
      },
    },
    application: {
      rounds: 2,
      sessions: 2,
      concurrency: 1,
      maxTotalRssDeltaBytes: 1_000_000_000,
      maxTotalHeapUsedDeltaBytes: 1_000_000_000,
    },
    now: () => "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.runtimeCore.status, "ok");
  assert.equal(result.runtimeCore.sessions.ok, 4);
  assert.equal(result.runtimeCore.aggregate.events, 112);
  assert.equal(result.applicationCore.status, "ok");
  assert.equal(result.applicationCore.sessions.ok, 4);
  assert.equal(result.applicationCore.providerCalls, 4);
  assert.equal(result.applicationCore.aggregate.turns, 4);
  assert.deepEqual(result.summary, {
    sections: 2,
    okSections: 2,
    failedSections: 0,
    runtimeSessionsOk: 4,
    applicationSessionsOk: 4,
    providerCalls: 4,
  });
});
