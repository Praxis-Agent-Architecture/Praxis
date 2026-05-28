import assert from "node:assert/strict";
import test from "node:test";

import {
  createContextCompactionPipelineExecutor,
  createLocalSummaryCompactExecutor,
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

test("local summary CompactExecutor uses a model caller over passive compact material", async () => {
  const calls: unknown[] = [];
  const executor = createLocalSummaryCompactExecutor({
    caller: async (request) => {
      calls.push(request);
      assert.equal(request.kind, "praxis.contextCompact.modelCallerRequest");
      assert.equal(request.responseFormat, "json");
      assert.match(request.messages[0]?.text ?? "", /not a new agent/u);
      assert.match(request.messages[1]?.text ?? "", /patch\.apply/u);
      return {
        sessionSummaryText: "User asked to build the editor. patch.apply wrote src/app.ts. npm run build passed.",
        recentConversationText: "Continue from the verified editor build.",
        preservedFacts: ["src/app.ts was written", "npm run build passed"],
        removedNoise: ["duplicate shell output"],
        artifactRefs: ["artifact.patch.2"],
      };
    },
  });
  const result = await executor.compact({
    sessionId: "session.local.summary.compact",
    trigger: "toolLoopBoundary",
    materialRefs: ["recent.1", "observation.1"],
    materials: [
      {
        id: "recent.1",
        promptSegmentKind: "recentConversation",
        source: "application.ledger.conversation",
        text: "user: Build the editor.\nassistant: applying patch.",
      },
      {
        id: "observation.1",
        promptSegmentKind: "observations",
        source: "application.ledger.tool",
        text: "tool: patch.apply\nresult: wrote src/app.ts\nverification: npm run build passed",
        metadata: { artifactRefs: ["artifact.patch.1"] },
      },
    ],
    currentUserTurnText: "Continue.",
    estimatedTokens: 950,
    contextWindowTokens: 1000,
    now: "2026-05-28T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(calls.length, 1);
  assert.equal(result.record.executor, "summaryAgent");
  assert.equal(result.record.metadata.compactBackend, "local-summary-model-call");
  assert.deepEqual(result.record.artifactRefs, ["artifact.patch.1", "artifact.patch.2"]);
  assert.deepEqual(result.record.metadata.preservedFacts, ["src/app.ts was written", "npm run build passed"]);
  assert.match(result.sessionSummaryText, /patch\.apply wrote src\/app\.ts/u);
  assert.match(result.recentConversationText, /verified editor build/u);
  assert.equal(result.events.includes("contextCompact.localSummary.completed"), true);
});

test("local summary CompactExecutor can fallback to runtime passive compaction", async () => {
  const executor = createLocalSummaryCompactExecutor({
    caller: async () => {
      throw new Error("summary model unavailable");
    },
  });
  const result = await executor.compact({
    sessionId: "session.local.summary.fallback",
    trigger: "turnBoundary",
    materialRefs: ["recent.1"],
    materials: [{
      id: "recent.1",
      promptSegmentKind: "recentConversation",
      text: "user: Continue from prior work.",
    }],
    estimatedTokens: 950,
    contextWindowTokens: 1000,
    now: "2026-05-28T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.record.executor, "runtimeFallback");
  assert.equal(result.events.includes("contextCompact.localSummary.fallbackAfterModelFailure"), true);
  assert.match(result.sessionSummaryText, /Runtime fallback compact summary/u);
});

test("context compaction pipeline runs organizer then compactor as runtime-controlled utility passes", async () => {
  const calls: { role: string; system: string; user: string }[] = [];
  const executor = createContextCompactionPipelineExecutor({
    organizerCaller: async (request) => {
      calls.push({
        role: String(request.metadata.utilityAgentRole),
        system: request.messages[0]?.text ?? "",
        user: request.messages[1]?.text ?? "",
      });
      assert.equal(request.metadata.utilityAgentRole, "contextOrganizer");
      assert.equal(request.metadata.promptPackOverride, "replace-1-2-drop-3");
      assert.equal(request.metadata.toolDeclarations, "removed");
      assert.match(request.messages[0]?.text ?? "", /temporary utility pass/u);
      assert.match(request.messages[0]?.text ?? "", /removed layer 3 toolDeclarations/u);
      return {
        organizedText: "Active task: keep editor build state. Verified patch.apply wrote src/app.ts. Drop duplicate ls output.",
        preservedFacts: ["patch.apply wrote src/app.ts"],
        removedNoise: ["duplicate ls output"],
        staleClaims: ["old server port failed"],
        artifactRefs: ["artifact.organized.1"],
      };
    },
    compactorCaller: async (request) => {
      calls.push({
        role: String(request.metadata.utilityAgentRole),
        system: request.messages[0]?.text ?? "",
        user: request.messages[1]?.text ?? "",
      });
      assert.equal(request.metadata.utilityAgentRole, "contextCompactor");
      assert.equal(request.metadata.promptPackOverride, "replace-1-2-drop-3");
      assert.match(request.messages[1]?.text ?? "", /patch\.apply wrote src\/app\.ts/u);
      return {
        sessionSummaryText: "User is building an editor. src/app.ts was written by patch.apply and duplicate ls output was removed.",
        recentConversationText: "Resume by verifying the editor build and continuing implementation.",
        preservedFacts: ["src/app.ts was written"],
        removedNoise: ["duplicate ls output"],
        artifactRefs: ["artifact.compacted.1"],
      };
    },
  });

  const result = await executor.compact({
    sessionId: "session.pipeline.compact",
    trigger: "turnBoundary",
    materialRefs: ["recent.1", "observation.1"],
    materials: [
      {
        id: "recent.1",
        promptSegmentKind: "recentConversation",
        source: "application.ledger.conversation",
        text: "user: Build the editor.\nassistant: applying patch.\nassistant: duplicate status.",
      },
      {
        id: "observation.1",
        promptSegmentKind: "observations",
        source: "application.ledger.tool",
        text: "tool: patch.apply\nresult: wrote src/app.ts\nverification: pending",
        metadata: { artifactRefs: ["artifact.patch.1"] },
      },
    ],
    currentUserTurnText: "Continue without repeating completed work.",
    estimatedTokens: 950,
    contextWindowTokens: 1000,
    now: "2026-05-28T00:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(calls.map((call) => call.role), ["contextOrganizer", "contextCompactor"]);
  assert.equal(result.record.executor, "summaryAgent");
  assert.equal(result.record.metadata.compactBackend, "runtime-controlled-utility-agent-pipeline");
  assert.equal(result.record.metadata.utilityAgentLifecycle, "oneshot-disposed");
  assert.deepEqual(result.record.artifactRefs, ["artifact.patch.1", "artifact.organized.1", "artifact.compacted.1"]);
  assert.match(result.sessionSummaryText, /src\/app\.ts was written/u);
  assert.match(result.recentConversationText, /Resume by verifying/u);
  assert.equal(result.events.includes("contextCompact.pipeline.organizer.completed"), true);
  assert.equal(result.events.includes("contextCompact.pipeline.compactor.completed"), true);
  assert.equal(result.events.includes("contextCompact.pipeline.completed"), true);
});
