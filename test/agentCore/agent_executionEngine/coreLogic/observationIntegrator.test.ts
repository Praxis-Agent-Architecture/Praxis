import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { defineAgentCoreContractTest } from "../../agentCoreContractTestHelper.js";
import {
  DEFAULT_OBSERVATION_TURN_INLINE_BUDGET_BYTES,
  DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY,
  DEFAULT_OBSERVATION_COMPRESSION_POLICY,
  DEFAULT_SUMMARY_AGENT_REF,
  DEFAULT_TOOL_RESULT_SIZE_POLICY,
  createFallbackMemoryRef,
  createObservationMaterial,
} from "../../../../src/executionEngine/coreLogic/observationIntegrator.js";

defineAgentCoreContractTest({
  sourcePath: "src/executionEngine/coreLogic/observationIntegrator.ts",
  docPath: "docs/agentCore/agent_executionEngine/coreLogic/observationIntegrator.md",
  testFileUrl: import.meta.url,
});

test("createObservationMaterial turns tool output into PromptPack material", () => {
  const observation = createObservationMaterial({
    observationId: "observation-1",
    source: "baseTool",
    status: "completed",
    title: "BaseTool code.read",
    summary: "read file",
    refs: ["call-1", "code.read"],
    payload: { text: "hello" },
    metadata: { toolCallId: "call-1" },
  });

  assert.equal(observation.observationId, "observation-1");
  assert.equal(observation.material.kind, "tool-summary");
  assert.equal(observation.material.trusted, true);
  assert.equal(observation.material.metadata?.observationStatus, "completed");
  assert.equal(observation.trustLevel, "toolOutput");
  assert.equal(observation.material.metadata?.observationTrustLevel, "toolOutput");
  assert.equal(observation.summaryDelegation.allowCurrentAgentSelfSummary, false);
  assert.equal(observation.material.metadata?.summaryDelegationMode, "summaryAgent");
  assert.equal(observation.compression.enabled, true);
  assert.equal(observation.compression.compressionRatio, 0.05);
  assert.deepEqual(observation.refs, ["call-1", "code.read"]);
  assert.match(observation.material.text, /hello/u);
});

test("createObservationMaterial keeps runtime observations provider-neutral", () => {
  const observation = createObservationMaterial({
    observationId: "observation-runtime",
    source: "runtime",
    status: "failed",
    title: "Runtime governance",
    summary: "denied",
  });

  assert.equal(observation.material.kind, "runtime");
  assert.equal(observation.material.priority, 80);
  assert.equal(observation.material.source, "runtime.observation.runtime");
  assert.equal(observation.trustLevel, "runtimeFact");
});

test("createObservationMaterial stores large payloads as artifact refs instead of inline prompt text", () => {
  assert.equal(DEFAULT_TOOL_RESULT_SIZE_POLICY.maxInlineBytes, 32 * 1024);
  assert.equal(DEFAULT_OBSERVATION_TURN_INLINE_BUDGET_BYTES, 128 * 1024);
  const observation = createObservationMaterial({
    observationId: "observation-large",
    source: "baseTool",
    status: "completed",
    title: "BaseTool code.search_Ripgrep",
    summary: "large search result",
    payload: "x".repeat(128),
    sizePolicy: { maxInlineBytes: 64 },
    artifactUri: "artifact://search-result",
  });

  assert.equal(observation.artifactRef?.uri, "artifact://search-result");
  assert.equal(observation.artifactRef?.reason, "toolResultTooLarge");
  assert.equal(observation.selectionFlow?.kind, "largeObservationSelection");
  assert.equal(observation.selectionFlow?.publicSafe, true);
  assert.match(observation.material.text, /payloadArtifact: artifact:\/\/search-result/u);
  assert.match(observation.material.text, /summaryAgent: summaryAgent\.default/u);
  assert.match(observation.material.text, /selectionBudgetBytes: 64/u);
  assert.doesNotMatch(observation.material.text, /xxxxxxxxxxxxxxxxxxxxxxxx/u);
  assert.equal(observation.material.metadata?.largeObservationSelection, true);
});

test("createObservationMaterial can persist oversized tool payloads for later lookup", () => {
  const workspace = mkdtempSync(join(tmpdir(), "praxis-observation-artifact-"));
  const marker = "RAXODE_LARGE_TOOL_PAYLOAD_";

  try {
    const observation = createObservationMaterial({
      observationId: "session:turn:tool/read",
      source: "baseTool",
      status: "completed",
      title: "BaseTool code.search",
      summary: "large search result",
      payload: { stdout: marker.repeat(2000) },
      artifactStore: {
        workspaceRoot: workspace,
        sessionId: "session-artifact",
      },
    });

    assert.ok(observation.artifactRef?.path);
    assert.equal(observation.artifactRef?.uri.startsWith("file://"), true);
    assert.equal(existsSync(observation.artifactRef.path), true);
    assert.match(readFileSync(observation.artifactRef.path, "utf8"), /RAXODE_LARGE_TOOL_PAYLOAD_/u);
    assert.equal(observation.material.text.includes(marker.repeat(10)), false);
    assert.equal(observation.material.metadata?.artifactPath, observation.artifactRef.path);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("createObservationMaterial allows explicit trust levels for external and cached observations", () => {
  const external = createObservationMaterial({
    observationId: "observation-external",
    source: "runtime",
    status: "completed",
    title: "External source",
    summary: "web result",
    trustLevel: "externalSource",
  });
  assert.equal(external.trustLevel, "externalSource");

  const cached = createObservationMaterial({
    observationId: "observation-cache",
    source: "runtime",
    status: "completed",
    title: "Cached summary",
    summary: "summary",
    trustLevel: "cachedSummary",
  });
  assert.equal(cached.trustLevel, "cachedSummary");
});

test("createObservationMaterial delegates summaries to CMP or summary agent by default", () => {
  assert.equal(DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY.allowCurrentAgentSelfSummary, false);
  assert.equal(DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY.compressionRatio, 0.05);
  assert.equal(DEFAULT_OBSERVATION_COMPRESSION_POLICY.primitive, "compressObservation");
  assert.equal(DEFAULT_SUMMARY_AGENT_REF.agentRef, "summaryAgent.default");

  const cmp = createObservationMaterial({
    observationId: "observation-cmp",
    source: "baseTool",
    status: "completed",
    title: "Tool result",
    summary: "needs summary",
    summaryDelegation: { mode: "cmp" },
  });
  assert.equal(cmp.summaryDelegation.mode, "cmp");
  assert.equal(cmp.summaryDelegation.allowCurrentAgentSelfSummary, false);
  assert.equal(cmp.compression.owner, "cmp");
  assert.equal(cmp.material.metadata?.summaryDelegationMode, "cmp");

  const disabled = createObservationMaterial({
    observationId: "observation-no-summary",
    source: "baseTool",
    status: "completed",
    title: "Tool result",
    summary: "inline",
    summaryDelegation: { mode: "disabled", allowCurrentAgentSelfSummary: false },
  });
  assert.equal(disabled.summaryDelegation.mode, "disabled");
  assert.equal(disabled.summaryDelegation.allowCurrentAgentSelfSummary, false);
  assert.equal(disabled.compression.owner, "runtimeFallback");
});

test("createFallbackMemoryRef provides a session-local markdown index that MP can take over", () => {
  const ref = createFallbackMemoryRef(" session-1 ");
  assert.equal(ref.memoryId, "session-1:memory:fallback-md-index");
  assert.equal(ref.kind, "sessionLocalMarkdownIndex");
  assert.equal(ref.storageHint, ".rax_workspace");
  assert.equal(ref.takeoverReadyForMp, true);
  assert.equal(ref.publicSafe, true);
});

test("createObservationMaterial folds large payloads into artifact references", () => {
  const marker = "RAXODE_LARGE_TOOL_PAYLOAD_";
  const observation = createObservationMaterial({
    observationId: "observation.large",
    source: "baseTool",
    status: "completed",
    title: "BaseTool shell.commandExecution",
    summary: "tool invocation completed",
    payload: { stdout: marker.repeat(4000) },
  });

  assert.ok(observation.artifactRef);
  assert.match(observation.material.text, /payloadArtifact/u);
  assert.match(observation.material.text, /payloadBytes/u);
  assert.equal(observation.material.text.includes(marker.repeat(20)), false);
});
