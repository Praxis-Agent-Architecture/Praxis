import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationExecutionMonitorSmoke,
} from "../../examples/scripts/runtime_application_execution_monitor_smoke.js";

test("application execution monitor smoke consumes application cache events through the monitor", async () => {
  const result = await runApplicationExecutionMonitorSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.application.status, "ok");
  assert.equal(result.monitor.kind, "praxis.executionMonitor.report");
  assert.equal(result.monitor.publicSafe, true);
  assert.equal(result.monitor.sourceKind, "in-memory");
  assert.equal(result.monitor.sessionsAnalyzed, 1);
  assert.equal(result.monitor.modelCalls, 2);
  assert.equal(result.monitor.cacheTelemetryCoverage, 1);
  assert.equal(result.monitor.dynamicPayloadChangedCalls, 1);
  assert.equal(result.monitor.previousResponseReuseCalls, 0);
  assert.equal(result.monitor.weightedCacheHitRate, 160 / 450);
  assert.equal(result.monitor.promptPackSegmentsIncludeUserTurn, true);
  assert.equal(result.monitor.promptPackSegmentsIncludeRecentConversation, true);
  assert.equal(result.monitor.hasLowCacheHitFinding, true);
  assert.equal(result.monitor.hasDynamicPayloadFinding, true);
  assert.equal(result.monitor.artifactCount, 0);
  assert.equal(result.modelFleetMonitor.status, "ok");
  assert.equal(result.modelFleetMonitor.modelCalls, 4);
  assert.equal(result.modelFleetMonitor.failedCalls, 3);
  assert.equal(result.modelFleetMonitor.retryAttempts, 1);
  assert.equal(result.modelFleetMonitor.fallbackCalls, 1);
  assert.equal(result.modelFleetMonitor.retryableFailures, 2);
  assert.equal(result.modelFleetMonitor.nonRetryableFailures, 1);
  assert.deepEqual(result.modelFleetMonitor.failureCodes, ["CALLER_FAILED", "PROVIDER_RATE_LIMITED"]);
  assert.deepEqual(result.modelFleetMonitor.endpointRefs, ["fallback", "primary"]);
  assert.deepEqual(result.modelFleetMonitor.fallbackFromRefs, ["primary"]);
  assert.equal(result.modelFleetMonitor.findingIds.includes("model.fleet.retryable-failure"), true);
  assert.equal(result.modelFleetMonitor.findingIds.includes("model.fleet.fallback-selected"), true);
  assert.equal(result.modelFleetMonitor.findingIds.includes("model.fleet.non-retryable-failure"), true);
  assert.equal(result.events.observedModelCompleted, 2);
  assert.equal(result.events.observedFinal, true);
  assert.equal(result.view.finalOutput, "application promptPack cache second turn completed");
});
