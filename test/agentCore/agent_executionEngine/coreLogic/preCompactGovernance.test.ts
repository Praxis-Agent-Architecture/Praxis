import assert from "node:assert/strict";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  createModelPreCompactGovernanceExecutor,
  parsePreCompactGovernanceResult,
  type PreCompactGovernancePacket,
} from "../../../../src/executionEngine/coreLogic/preCompactGovernance.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/preCompactGovernance.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/preCompactGovernance.md",
  testFileUrl: import.meta.url,
});

function packet(): PreCompactGovernancePacket {
  return {
    kind: "praxis.preCompactGovernance.packet",
    version: 1,
    runtimeId: "runtime-test",
    sessionId: "session-test",
    turnIndex: 3,
    trigger: "turnBoundary",
    currentUserTurnText: "keep this current request",
    governanceInstruction: "govern only",
    projectContext: [{
      id: "project.context",
      kind: "runtime",
      segmentKind: "projectContext",
      text: "Project uses Praxis runtime.",
    }],
    sessionSummary: [{
      id: "session.summary",
      kind: "cmp",
      segmentKind: "sessionSummary",
      text: "Old summary with stale noise.",
    }],
    recentConversation: [{
      id: "conversation.recent:1",
      kind: "user",
      segmentKind: "recentConversation",
      text: "Recent correction.",
    }],
    memoryContext: [{
      id: "memory.ref",
      segmentKind: "memoryContext",
      summary: "Application-injected memory reference only.",
      refs: ["memory.ref"],
    }],
    retrievedContext: [],
    observations: [],
    excludedSegmentKinds: ["toolDeclarations", "assistantScratchpadPlan"],
    metadata: { promptPackId: "promptPack.test" },
  };
}

test("parsePreCompactGovernanceResult validates and normalizes governance JSON", () => {
  const parsed = parsePreCompactGovernanceResult(JSON.stringify({
    kind: "praxis.preCompactGovernance.result",
    version: 1,
    sessionSummaryCandidate: {
      text: "Governed session summary.",
      mode: "replace",
    },
    projectContextUpdates: [{
      id: "project.context.governed",
      text: "Keep the current Praxis runtime direction.",
      reason: "supported by recent conversation",
      evidenceRefs: ["conversation.recent:1"],
      confidence: 0.9,
    }],
    staleClaims: ["old branch is still active"],
    preservedFacts: [{ text: "current task is preCompactGovernance", evidenceRefs: ["conversation.recent:1"] }],
    removedNoise: [{ text: "old failed experiment", reason: "stale" }],
    uncertainty: [{ text: "future CMP shape remains out of scope" }],
    evidenceRefs: ["conversation.recent:1"],
  }));

  assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.error.message);
  if (!parsed.ok) return;
  assert.equal(parsed.result.sessionSummaryCandidate.text, "Governed session summary.");
  assert.equal(parsed.result.projectContextUpdates[0]?.id, "project.context.governed");
  assert.equal(parsed.result.staleClaims[0]?.text, "old branch is still active");
  assert.equal(parsed.result.removedNoise[0]?.reason, "stale");
});

test("parsePreCompactGovernanceResult rejects invalid JSON and missing summary candidate", () => {
  const invalidJson = parsePreCompactGovernanceResult("{not json");
  assert.equal(invalidJson.ok, false);
  if (invalidJson.ok) return;
  assert.equal(invalidJson.error.code, "INVALID_PRE_COMPACT_GOVERNANCE_JSON");

  const missingSummary = parsePreCompactGovernanceResult({
    kind: "praxis.preCompactGovernance.result",
    version: 1,
  });
  assert.equal(missingSummary.ok, false);
  if (missingSummary.ok) return;
  assert.equal(missingSummary.error.code, "MISSING_PRE_COMPACT_SESSION_SUMMARY");
});

test("parsePreCompactGovernanceResult rejects missing required array fields", () => {
  const parsed = parsePreCompactGovernanceResult({
    kind: "praxis.preCompactGovernance.result",
    version: 1,
    sessionSummaryCandidate: { text: "Summary.", mode: "replace" },
    projectContextUpdates: [],
    staleClaims: [],
    preservedFacts: [],
    removedNoise: [],
    uncertainty: [],
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.error.code, "INVALID_PRE_COMPACT_GOVERNANCE_SCHEMA");
  assert.match(parsed.error.message, /evidenceRefs/);
});

test("parsePreCompactGovernanceResult rejects malformed array items instead of dropping them", () => {
  const badProjectUpdate = parsePreCompactGovernanceResult({
    kind: "praxis.preCompactGovernance.result",
    version: 1,
    sessionSummaryCandidate: { text: "Summary.", mode: "replace" },
    projectContextUpdates: [{ reason: "missing text" }],
    staleClaims: [],
    preservedFacts: [],
    removedNoise: [],
    uncertainty: [],
    evidenceRefs: [],
  });
  assert.equal(badProjectUpdate.ok, false);
  if (badProjectUpdate.ok) return;
  assert.match(badProjectUpdate.error.message, /projectContextUpdates\[0\]/);

  const badEvidenceRef = parsePreCompactGovernanceResult({
    kind: "praxis.preCompactGovernance.result",
    version: 1,
    sessionSummaryCandidate: { text: "Summary.", mode: "replace" },
    projectContextUpdates: [],
    staleClaims: [{ text: "stale", evidenceRefs: [42] }],
    preservedFacts: [],
    removedNoise: [],
    uncertainty: [],
    evidenceRefs: [],
  });
  assert.equal(badEvidenceRef.ok, false);
  if (badEvidenceRef.ok) return;
  assert.match(badEvidenceRef.error.message, /staleClaims\[0\]\.evidenceRefs\[0\]/);
});

test("createModelPreCompactGovernanceExecutor records completed governance output", async () => {
  const executor = createModelPreCompactGovernanceExecutor({
    caller: async () => ({
      kind: "praxis.preCompactGovernance.result",
      version: 1,
      sessionSummaryCandidate: { text: "New summary.", mode: "append" },
      projectContextUpdates: [{ text: "Project context update.", evidenceRefs: ["project.context"] }],
      staleClaims: [],
      preservedFacts: [{ text: "Preserved fact." }],
      removedNoise: [{ text: "Noisy detail.", reason: "duplicate" }],
      uncertainty: [],
      evidenceRefs: ["project.context"],
    }),
  });

  const result = await executor.govern({
    packet: packet(),
    now: "2026-05-27T00:00:00.000Z",
    metadata: { promptPackId: "promptPack.test" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.record.status, "completed");
  assert.equal(result.record.appliedSessionSummary, true);
  assert.equal(result.record.appliedProjectContextUpdates, 1);
  assert.deepEqual(result.events, ["preCompactGovernance.completed"]);
  assert.equal(result.record.packetMaterialRefs.includes("runtime.input.currentUserTurn"), true);
});
