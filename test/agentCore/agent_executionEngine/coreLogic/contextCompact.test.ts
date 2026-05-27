import assert from "node:assert/strict";
import test from "node:test";

import {
  createRuntimeFallbackCompactExecutor,
  decideTurnBoundaryCompact,
} from "../../../../src/executionEngine/coreLogic/contextCompact.js";

test("decideTurnBoundaryCompact triggers only at the configured boundary threshold", () => {
  const below = decideTurnBoundaryCompact({
    estimatedNextPromptTokens: 949,
    contextWindowTokens: 1000,
  });
  assert.equal(below.shouldCompact, false);

  const atThreshold = decideTurnBoundaryCompact({
    trigger: "toolLoopBoundary",
    estimatedNextPromptTokens: 950,
    contextWindowTokens: 1000,
  });
  assert.equal(atThreshold.shouldCompact, true);
  assert.equal(atThreshold.trigger, "toolLoopBoundary");
  assert.equal(atThreshold.thresholdRatio, 0.95);
});

test("decideTurnBoundaryCompact clamps invalid custom thresholds", () => {
  const tooHigh = decideTurnBoundaryCompact({
    estimatedNextPromptTokens: 1000,
    contextWindowTokens: 1000,
    thresholdRatio: 2,
  });
  assert.equal(tooHigh.thresholdRatio, 1);
  assert.equal(tooHigh.shouldCompact, true);

  const tooLow = decideTurnBoundaryCompact({
    estimatedNextPromptTokens: 5,
    contextWindowTokens: 1000,
    thresholdRatio: -1,
  });
  assert.equal(tooLow.thresholdRatio, 0.01);
  assert.equal(tooLow.shouldCompact, false);
});

test("runtime fallback CompactExecutor returns a public-safe CompactRecord", async () => {
  const executor = createRuntimeFallbackCompactExecutor();
  const result = await executor.compact({
    sessionId: "session.compact",
    trigger: "turnBoundary",
    materialRefs: ["summary.old", "observation.1", "conversation.1"],
    currentUserTurnText: "Keep this user turn in the next PromptPack.",
    estimatedTokens: 950,
    contextWindowTokens: 1000,
    now: "2026-05-26T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.record.kind, "praxis.contextCompact.record");
  assert.equal(result.record.executor, "runtimeFallback");
  assert.equal(result.record.before.materialRefs.length, 3);
  assert.equal(result.record.after.sessionSummaryRef.endsWith(":sessionSummary"), true);
  assert.equal(result.record.publicSafe, true);
  assert.match(result.sessionSummaryText, /Compacted 3 material refs/);
  assert.match(result.recentConversationText, /Keep this user turn/);
});
