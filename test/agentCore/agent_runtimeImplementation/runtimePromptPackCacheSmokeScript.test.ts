import assert from "node:assert/strict";
import test from "node:test";

import {
  runRuntimePromptPackCacheSmoke,
} from "../../../examples/scripts/runtime_promptpack_cache_smoke.js";

test("runtime promptPack cache smoke keeps stable prefix separate from dynamic turn material", () => {
  const result = runRuntimePromptPackCacheSmoke();

  assert.equal(result.status, "ok");
  assert.equal(result.promptPack.id, "promptpack.cache-smoke");
  assert.deepEqual(result.cachePlan.cacheablePrefixSegmentKinds, [
    "stableSystemCore",
    "declaredRuntimeContext",
    "projectContext",
    "toolDeclarations",
    "sessionSummary",
  ]);
  assert.deepEqual([...result.cachePlan.dynamicSegmentKinds].sort(), ["observations", "userTurn"]);
  assert.equal(
    result.cachePlan.segments.find((segment) => String(segment.segmentKind) === "recentConversation")?.cachePolicy,
    "dynamic-no-cache",
  );
  assert.equal(result.cachePlan.stablePrefixHash.length, 64);
  assert.equal(result.cachePlan.providerCacheHintPlan.stableToolDeclarationHash.length, 64);
  assert.equal(result.providerLowering.providerVisibleSegmentKinds.includes("userTurn"), true);
  assert.equal(result.providerLowering.providerVisibleSegmentKinds.includes("observations"), true);
  assert.equal(result.providerLowering.cacheRiskWarnings.length, 0);
  assert.deepEqual(result.providerLowering.invariantChecks, {
    stablePrefixExcludesUserTurn: true,
    stablePrefixExcludesObservations: true,
    providerUsesCacheHintPlan: true,
    dynamicInputHasCurrentTask: true,
  });
});
