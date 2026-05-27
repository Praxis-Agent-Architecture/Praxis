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
  assert.match(result.sessionSummaryText, /ledger-aware passive denoise/);
  assert.match(result.sessionSummaryText, /Preserve causal order/);
  assert.match(result.recentConversationText, /Keep this user turn/);
});

test("runtime fallback CompactExecutor preserves ledger cause-action-result material", async () => {
  const executor = createRuntimeFallbackCompactExecutor();
  const result = await executor.compact({
    sessionId: "session.ledger.compact",
    trigger: "toolLoopBoundary",
    materialRefs: ["recent.1", "observation.1", "empty.1"],
    materials: [
      {
        id: "observation.1",
        promptSegmentKind: "observations",
        source: "application.ledger.tool",
        text: "tool: patch.apply\ncausedBy: model.call.1\nresult: wrote src/app.ts\nverification: npm run build passed",
        metadata: { artifactRefs: ["artifact.patch.1"] },
      },
      {
        id: "recent.1",
        promptSegmentKind: "recentConversation",
        source: "application.ledger.conversation",
        text: "user: Build the editor.\nmodel: decided to inspect files.\ntool: file.search completed.",
      },
      {
        id: "empty.1",
        promptSegmentKind: "observations",
        text: "   ",
      },
    ],
    currentUserTurnText: "Continue from the verified editor build.",
    estimatedTokens: 950,
    contextWindowTokens: 1000,
    now: "2026-05-26T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.sessionSummaryText, /user: Build the editor/u);
  assert.match(result.sessionSummaryText, /tool: patch\.apply/u);
  assert.match(result.sessionSummaryText, /verification: npm run build passed/u);
  assert.match(result.recentConversationText, /file\.search completed/u);
  assert.match(result.recentConversationText, /Continue from the verified editor build/u);
  assert.deepEqual(result.record.artifactRefs, ["artifact.patch.1"]);
  assert.equal(result.record.metadata.passiveDenoise, "ledger-aware");
  assert.equal(result.record.metadata.droppedEmptyMaterials, 1);
  assert.equal(result.events.includes("contextCompact.runtimeFallback.passiveDenoise.completed"), true);
});
