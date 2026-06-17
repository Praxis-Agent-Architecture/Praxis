import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationPromptPackCacheSmoke,
} from "../../examples/scripts/runtime_application_promptpack_cache_smoke.js";

test("application promptPack cache smoke exposes stable prefix and dynamic payload cache facts", async () => {
  const result = await runApplicationPromptPackCacheSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.counters.turns, 2);
  assert.equal(result.view.counters.modelCalls, 1);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.cacheEvents.length, 2);
  assert.equal(result.cacheEvents[0]?.hasCacheDebug, true);
  assert.equal(result.cacheEvents[1]?.hasCacheDebug, true);
  assert.equal(result.cacheInvariant.stablePrefixHashUnchanged, true);
  assert.equal(result.cacheInvariant.dynamicPayloadHashChanged, true);
  assert.equal(result.cacheInvariant.instructionsHashUnchanged, true);
  assert.equal(result.cacheInvariant.inputHashChanged, true);
  assert.equal(result.cacheInvariant.promptCacheKeyStable, true);
  assert.equal(result.cacheInvariant.secondComparisonAvailable, true);
  assert.equal(result.modelCallReport.reportStatus, "ok");
  assert.equal(result.modelCallReport.applicationCommandKind, "praxis.application.modelCallReport");
  assert.equal(result.modelCallReport.applicationQueryModelCalls, 2);
  assert.equal(result.modelCallReport.modelCalls, 2);
  assert.equal(result.modelCallReport.completed, 2);
  assert.equal(result.modelCallReport.withUsage, 2);
  assert.equal(result.modelCallReport.withCacheDebug, 2);
  assert.equal(result.modelCallReport.cacheTelemetryModelCalls, 2);
  assert.equal(result.modelCallReport.promptCacheKeys.length, 1);
  assert.equal(result.modelCallReport.weightedCacheHitRate, 160 / 450);
  assert.equal(result.modelCallReport.openaiModelCalls, 2);
  assert.equal(result.modelCallReport.cacheDebugModelCalls, 2);
  assert.equal(result.modelCallReport.primaryEndpointCalls, 2);
  assert.equal(result.modelCallReport.stablePrefixUnchanged, true);
  assert.equal(result.modelCallReport.dynamicPayloadChanged, true);
  assert.equal(result.modelCallReport.publicSafe, true);
  assert.equal(result.providerBodies.firstPromptCacheKey, result.providerBodies.secondPromptCacheKey);
  assert.equal(result.providerBodies.firstHasPreviousResponseId, false);
  assert.equal(result.providerBodies.secondHasPreviousResponseId, false);
  assert.ok(result.promptPack.segmentKinds.includes("userTurn"));
  assert.ok(result.promptPack.dynamicSegmentKinds.includes("recentConversation"));
  assert.ok(result.promptPack.cacheablePrefixEstimatedTokens > 0);
  assert.ok(result.promptPack.dynamicEstimatedTokens > 0);
});
