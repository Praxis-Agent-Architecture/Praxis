import assert from "node:assert/strict";
import test from "node:test";

import { createMainLoopStepRecord } from "../../../../src/executionEngine/coreLogic/mainLoop.js";
import {
  createRuntimeModelCallIndex,
  createRuntimeModelCallReport,
  queryRuntimeModelCalls,
  type RuntimeModelCallApplicationEvent,
} from "../../../../src/runtimeImplementation/runtime.modelCallPlane/index.js";
import type { RuntimeSessionSnapshot } from "../../../../src/runtimeImplementation/runtimeSessionStateEventStore.js";

function snapshot(): RuntimeSessionSnapshot {
  return {
    session: {
      sessionId: "session.modelcall",
      runtimeId: "runtime.modelcall",
      agentId: "agent.modelcall",
      manifestHash: "manifest.modelcall",
      createdAt: "2026-06-09T00:00:00.000Z",
      status: "completed",
      metadata: { source: "test", accessToken: "secret-session-token" },
    },
    states: [],
    events: [],
    invocations: [{
      sessionId: "session.modelcall",
      invocationId: "model.call.1",
      kind: "model",
      target: "carrier.openai.primary",
      ok: true,
      createdAt: "2026-06-09T00:00:01.000Z",
      summary: {
        turn: 0,
        promptPackId: "prompt.pack.1",
        loweringId: "lowering.1",
        modelFleetEndpointRef: "primary",
        modelFleetRequiredCapabilities: ["toolCalling"],
        modelFleetRetryAttempt: 0,
        modelFleetMaxRetries: 1,
        authorization: "Bearer secret-invocation-token",
      },
    }],
    mainLoopSteps: [
      createMainLoopStepRecord({
        sessionId: "session.modelcall",
        turnIndex: 1,
        stepIndex: 6,
        actionPrimitive: "invokeModel",
        status: "completed",
        inputRefs: ["lowering.1"],
        outputRefs: ["model.call.1"],
        modelCallId: "model.call.1",
        promptPackRef: "prompt.pack.1",
        loweredPromptRef: "lowering.1",
        now: "2026-06-09T00:00:02.000Z",
        metadata: {
          credential: "secret-step-credential",
        },
      }),
    ],
    procedures: [],
    approvals: [],
    errors: [],
  };
}

function applicationEvents(): readonly RuntimeModelCallApplicationEvent[] {
  return [{
    eventId: "turn.1.model.model.call.1.started",
    kind: "model",
    status: "running",
    message: "model request started: gpt-5.5",
    createdAt: "2026-06-09T00:00:01.000Z",
    sessionId: "session.modelcall",
    runtimeId: "runtime.modelcall",
    turnId: "turn.1",
    publicSafe: true,
    metadata: {
      modelPhase: "started",
      invocationId: "model.call.1",
      provider: "openai",
      carrierId: "carrier.openai.primary",
      model: "gpt-5.5",
      apiKey: "secret-started-api-key",
    },
  }, {
    eventId: "turn.1.model.model.call.1.completed",
    kind: "model",
    status: "running",
    message: "model request completed: gpt-5.5",
    createdAt: "2026-06-09T00:00:03.000Z",
    sessionId: "session.modelcall",
    runtimeId: "runtime.modelcall",
    turnId: "turn.1",
    publicSafe: true,
    metadata: {
      modelPhase: "completed",
      invocationId: "model.call.1",
      turnIndex: 0,
      provider: "openai",
      carrierId: "carrier.openai.primary",
      model: "gpt-5.5",
      usage: {
        inputTokens: 230,
        cachedInputTokens: 160,
        outputTokens: 12,
        totalTokens: 242,
        source: "openai.responses.usage",
        estimated: false,
      },
      cacheDebug: {
        kind: "praxis.modelCall.cacheDebug",
        promptCacheKey: "praxis-cache-key",
        promptPack: {
          totalEstimatedTokens: 3145,
          cacheablePrefixEstimatedTokens: 2917,
          dynamicEstimatedTokens: 228,
          segmentCount: 11,
        },
        providerBody: {
          previousProviderOutputItems: 0,
          toolResultInputs: 0,
          fingerprints: {
            instructionsHash: "instructions.hash",
            inputHash: "input.hash.2",
          },
          cacheShape: {
            providerStablePrefixEstimatedTokens: 3530,
            providerDynamicInputEstimatedTokens: 334,
            stablePrefixShare: 0.7782,
            dynamicInputShare: 0.0736,
            stablePrefixHash: "stable.hash",
            dynamicPayloadHash: "dynamic.hash.2",
          },
        },
        observedUsage: {
          inputTokens: 230,
          cachedInputTokens: 160,
          nonCachedInputTokens: 70,
          cacheHitRate: 0.6957,
          stablePrefixWarmthEstimate: 0.0453,
          diagnosis: "stable-prefix-cache-break",
        },
        comparisonToPrevious: {
          stablePrefixChanged: false,
          dynamicPayloadChanged: true,
          instructionsChanged: false,
          toolsChanged: false,
        },
        accessToken: "secret-cache-token",
      },
      providerResponseId: "resp.model.1",
      modelFleetEndpointRef: "fallback",
      fallbackFrom: "primary",
      modelFleetAdaptiveSelection: true,
      modelFleetCapabilitySelection: false,
      modelFleetRequiredCapabilities: ["toolCalling"],
      modelFleetRetryAttempt: 0,
      modelFleetMaxRetries: 0,
      modelFailureRetryable: false,
      authorization: "Bearer secret-event-token",
    },
  }];
}

test("runtime model-call report summarizes model, cache, and fleet facts without owning provider semantics", () => {
  const report = createRuntimeModelCallReport({
    sourceKind: "application-events",
    snapshot: snapshot(),
    applicationEvents: applicationEvents(),
  });

  assert.equal(report.kind, "praxis.runtime.modelCall.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.session.sessionId, "session.modelcall");
  assert.deepEqual(report.counts, {
    modelCalls: 1,
    completed: 1,
    failed: 0,
    started: 0,
    withUsage: 1,
    withCacheDebug: 1,
    cacheTelemetryModelCalls: 1,
    withProviderResponseId: 1,
    fallbackCalls: 1,
    retryAttempts: 0,
    retryableFailures: 0,
    nonRetryableFailures: 0,
    errors: 0,
  });
  assert.equal(report.coverage.hasRuntimeModelInvocations, true);
  assert.equal(report.coverage.hasApplicationModelEvents, true);
  assert.equal(report.coverage.hasUsage, true);
  assert.equal(report.coverage.hasCacheDebug, true);
  assert.equal(report.coverage.hasProviderResponseIds, true);
  assert.equal(report.coverage.hasFallbackEvidence, true);
  assert.deepEqual(report.providers, ["openai"]);
  assert.deepEqual(report.carrierIds, ["carrier.openai.primary"]);
  assert.deepEqual(report.models, ["gpt-5.5"]);
  assert.deepEqual(report.endpointRefs, ["fallback"]);
  assert.deepEqual(report.cacheDiagnoses, ["stable-prefix-cache-break"]);
  assert.deepEqual(report.promptCacheKeys, ["praxis-cache-key"]);
  assert.equal(report.usageTotals.inputTokens, 230);
  assert.equal(report.usageTotals.cachedInputTokens, 160);
  assert.equal(report.usageTotals.nonCachedInputTokens, 70);
  assert.equal(report.usageTotals.weightedCacheHitRate, 160 / 230);

  const call = report.modelCalls[0];
  assert.equal(call?.invocationId, "model.call.1");
  assert.equal(call?.status, "completed");
  assert.equal(call?.provider.provider, "openai");
  assert.equal(call?.provider.providerResponseId, "resp.model.1");
  assert.equal(call?.usage.source, "openai.responses.usage");
  assert.equal(call?.cache.promptCacheKey, "praxis-cache-key");
  assert.equal(call?.cache.stablePrefixHash, "stable.hash");
  assert.equal(call?.cache.dynamicPayloadHash, "dynamic.hash.2");
  assert.equal(call?.cache.comparisonStablePrefixChanged, false);
  assert.equal(call?.cache.comparisonDynamicPayloadChanged, true);
  assert.equal(call?.fleet.endpointRef, "fallback");
  assert.equal(call?.fleet.fallbackFrom, "primary");
  assert.equal(call?.fleet.adaptiveSelection, true);
  assert.deepEqual(call?.fleet.requiredCapabilities, ["toolCalling"]);
  assert.equal(call?.promptPackId, "prompt.pack.1");
  assert.equal(call?.loweringId, "lowering.1");

  const index = createRuntimeModelCallIndex(report);
  assert.equal(index.totalModelCalls, 1);
  assert.equal(index.byStatus.completed, 1);
  assert.equal(index.byProvider.openai, 1);
  assert.equal(index.byEndpointRef.fallback, 1);
  assert.equal(index.byCacheDiagnosis["stable-prefix-cache-break"], 1);
  assert.deepEqual(index.promptCacheKeys, ["praxis-cache-key"]);

  const query = queryRuntimeModelCalls({
    report,
    query: { provider: "openai", endpointRef: "fallback", cacheDiagnosis: "stable-prefix-cache-break" },
  });
  assert.equal(query.returnedModelCalls, 1);
  assert.equal(query.modelCalls[0]?.invocationId, "model.call.1");
  assert.equal(queryRuntimeModelCalls({ report, query: { limit: 0 } }).returnedModelCalls, 0);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("secret-session-token"), false);
  assert.equal(serialized.includes("secret-invocation-token"), false);
  assert.equal(serialized.includes("secret-step-credential"), false);
  assert.equal(serialized.includes("secret-started-api-key"), false);
  assert.equal(serialized.includes("secret-cache-token"), false);
  assert.equal(serialized.includes("secret-event-token"), false);
});

test("runtime model-call report can fall back to runtime snapshot-only facts", () => {
  const report = createRuntimeModelCallReport({
    sourceKind: "snapshot",
    snapshot: snapshot(),
  });

  assert.equal(report.counts.modelCalls, 1);
  assert.equal(report.counts.completed, 1);
  assert.equal(report.counts.withUsage, 0);
  assert.equal(report.coverage.hasRuntimeModelInvocations, true);
  assert.equal(report.coverage.hasApplicationModelEvents, false);
  assert.equal(report.modelCalls[0]?.provider.carrierId, "carrier.openai.primary");
  assert.equal(report.modelCalls[0]?.fleet.endpointRef, "primary");
  assert.equal(report.modelCalls[0]?.promptPackId, "prompt.pack.1");
});
