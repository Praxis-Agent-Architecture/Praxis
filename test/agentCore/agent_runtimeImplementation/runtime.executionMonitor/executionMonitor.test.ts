import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeExecutionMonitor,
  ExecutionMonitor,
  type ExecutionMonitorReport,
} from "../../../../src/agentCore/index.js";
import type { PraxisApplicationEvent, PraxisApplicationViewModel } from "../../../../src/applicationLayer/index.js";
import type { AgentModelCacheDebugRecord } from "../../../../src/runtimeImplementation/praxisRuntimeKernel.js";

function cacheDebug(overrides: Partial<AgentModelCacheDebugRecord> = {}): AgentModelCacheDebugRecord {
  return {
    kind: "praxis.modelCall.cacheDebug",
    strategy: "prompt-pack-cache-xray",
    promptCacheKey: "cache-key",
    promptPack: {
      totalEstimatedTokens: 1000,
      renderedTextEstimatedTokens: 1000,
      cacheablePrefixEstimatedTokens: 700,
      dynamicEstimatedTokens: 300,
      segmentCount: 4,
      segments: [
        {
          segmentKind: "stableSystemCore",
          cachePolicy: "cacheable",
          stability: "stable",
          estimatedTokens: 400,
          segmentHash: "stable-system",
          materialCount: 1,
          materialRefs: ["system"],
          providerHints: {},
        },
        {
          segmentKind: "toolDeclarations",
          cachePolicy: "cacheable",
          stability: "stable",
          estimatedTokens: 350,
          segmentHash: "tools",
          materialCount: 1,
          materialRefs: ["tools"],
          providerHints: {},
        },
        {
          segmentKind: "observations",
          cachePolicy: "dynamic",
          stability: "volatile",
          estimatedTokens: 270,
          segmentHash: "observations",
          materialCount: 1,
          materialRefs: ["obs"],
          providerHints: {},
        },
        {
          segmentKind: "userTurn",
          cachePolicy: "dynamic",
          stability: "volatile",
          estimatedTokens: 30,
          segmentHash: "user",
          materialCount: 1,
          materialRefs: ["user"],
          providerHints: {},
        },
      ],
      cacheRiskWarnings: [],
      providerLowering: {
        instructionSegmentKinds: ["stableSystemCore", "toolDeclarations"],
        dynamicInputSegmentKinds: ["observations", "userTurn"],
        instructionEstimatedTokens: 400,
        dynamicInputEstimatedTokens: 300,
        instructionsHash: "instructions",
        dynamicInputHash: "dynamic",
      },
    },
    providerBody: {
      estimatedTokens: 1000,
      inputEstimatedTokens: 400,
      toolsEstimatedTokens: 350,
      toolCount: 16,
      fingerprints: {
        instructionsHash: "instructions",
        toolsHash: "tools",
        inputHash: "input",
      },
      previousProviderOutputItems: 0,
      toolResultInputs: 1,
      toolResultBudget: {
        budgetBytes: 4096,
        originalToolResultBytes: 1000,
        replayedToolResultBytes: 800,
        fullToolResults: 1,
        compactedToolResults: 0,
      },
      cacheShape: {
        providerStablePrefixEstimatedTokens: 750,
        providerDynamicInputEstimatedTokens: 400,
        stablePrefixShare: 0.75,
        dynamicInputShare: 0.4,
        stablePrefixHash: "stable-prefix",
        dynamicPayloadHash: "dynamic-payload",
      },
    },
    observedUsage: {
      inputTokens: 1000,
      cachedInputTokens: 0,
      nonCachedInputTokens: 1000,
      cacheHitRate: 0,
      stablePrefixWarmthEstimate: 0,
      diagnosis: "provider-cache-miss-with-stable-prefix",
      reasons: ["stable prefix and provider tool fingerprints match"],
    },
    comparisonToPrevious: {
      previousStablePrefixHash: "stable-prefix",
      previousDynamicPayloadHash: "previous-dynamic",
      stablePrefixChanged: false,
      dynamicPayloadChanged: true,
      instructionsChanged: false,
      toolsChanged: false,
      changedFingerprintKeys: ["inputHash"],
    },
    ...overrides,
  };
}

function modelEvent(input: {
  eventId: string;
  sessionId: string;
  turnId: string;
  invocationId: string;
  debug: AgentModelCacheDebugRecord;
  cachedInputTokens?: number;
  previousProviderResponseId?: string;
}): PraxisApplicationEvent {
  return {
    eventId: input.eventId,
    kind: "model",
    status: "running",
    message: "model request completed",
    createdAt: "2026-05-26T00:00:00.000Z",
    sessionId: input.sessionId,
    turnId: input.turnId,
    publicSafe: true,
    metadata: {
      modelPhase: "completed",
      invocationId: input.invocationId,
      turnIndex: 1,
      provider: "openai",
      carrierId: "responses",
      model: "gpt-test",
      usage: {
        inputTokens: 1000,
        cachedInputTokens: input.cachedInputTokens ?? 0,
        outputTokens: 100,
        thinkingTokens: 25,
        totalTokens: 1125,
        estimated: false,
      },
      cacheDebug: input.debug,
      providerResponseId: "resp-current",
      previousProviderResponseId: input.previousProviderResponseId,
    },
  };
}

function view(sessionId: string): PraxisApplicationViewModel {
  return {
    applicationId: "application.test",
    projectId: "project.test",
    runtimeId: "runtime.test",
    sessionId,
    agentId: "agent.test",
    agentEntries: [],
    agents: { active: 1 },
    status: "completed",
    workspaceRoot: "/tmp/project",
    mode: "dry-run",
    model: { model: "gpt-test", reasoningEffort: "medium" },
    permissionProfile: "standard",
    toolProfile: "codingCore",
    sessions: [],
    approvals: [],
    tools: {
      profile: "codingCore",
      availableProfiles: ["codingCore"],
      defaultPolicyProfile: "standard",
      extensionSlots: [],
      total: 16,
      mounted: 16,
      byFamily: {},
      byRiskLevel: {},
      byReadiness: {},
      mountedToolIds: [],
    },
    counters: {
      turns: 1,
      events: 1,
      modelCalls: 1,
      toolCalls: 0,
      mainLoopSteps: 1,
    },
    lines: [],
    events: [],
  };
}

function assertFinding(report: ExecutionMonitorReport, id: string): void {
  assert.ok(report.findings.some((finding) => finding.id === id), `missing finding ${id}`);
}

test("execution monitor builds turn/session/project cache diagnostics", () => {
  const event = modelEvent({
    eventId: "event.model.completed",
    sessionId: "session-a",
    turnId: "turn-a",
    invocationId: "model-a",
    debug: cacheDebug(),
  });
  const report = analyzeExecutionMonitor({
    events: [event],
    views: [view("session-a")],
    runDir: "/tmp/devdoctor/runs/latest",
    generatedAt: "2026-05-26T00:00:00.000Z",
  });

  assert.equal(report.kind, "praxis.executionMonitor.report");
  assert.equal(report.publicSafe, true);
  assert.equal(report.sessions.length, 1);
  assert.equal(report.sessions[0]?.turns.length, 1);
  assert.equal(report.project.usage.modelCalls, 1);
  assert.equal(report.project.usage.inputTokens, 1000);
  assert.equal(report.project.cache.providerCacheMissCalls, 1);
  assert.equal(report.project.cache.weightedCacheHitRate, 0);
  assertFinding(report, "cache.provider.stable-prefix-miss");
  assertFinding(report, "cache.dynamic-payload.large");
  assertFinding(report, "cache.tool-result-replay.large");
  assertFinding(report, "cache.tool-declarations.large");
  assertFinding(report, "cache.observations.large");
  assertFinding(report, "cache.session-summary.missing");
  assert.equal(report.findings.every((finding) => finding.pointers.every((pointer) => pointer.path?.includes("events.jsonl") ?? true)), true);
});

test("ExecutionMonitor incrementally observes events and detects previous response reuse", () => {
  const monitor = new ExecutionMonitor({
    runDir: "/tmp/devdoctor/runs/latest",
    now: () => "2026-05-26T00:00:00.000Z",
  });
  monitor.observeView(view("session-a"));
  monitor.observeEvent(modelEvent({
    eventId: "event.model.completed",
    sessionId: "session-a",
    turnId: "turn-a",
    invocationId: "model-a",
    cachedInputTokens: 900,
    previousProviderResponseId: "resp-prev",
    debug: cacheDebug({
      promptPack: {
        ...cacheDebug().promptPack,
        segments: [
          ...cacheDebug().promptPack.segments.filter((segment) => segment.segmentKind !== "observations"),
          {
            segmentKind: "sessionSummary",
            cachePolicy: "cacheable",
            stability: "semi-stable",
            estimatedTokens: 120,
            segmentHash: "summary",
            materialCount: 1,
            materialRefs: ["summary"],
            providerHints: {},
          },
        ],
      },
      observedUsage: {
        inputTokens: 1000,
        cachedInputTokens: 900,
        nonCachedInputTokens: 100,
        cacheHitRate: 0.9,
        stablePrefixWarmthEstimate: 1.2,
        diagnosis: "warm-stable-prefix",
        reasons: ["overall cache hit rate is already warm"],
      },
      providerBody: {
        ...cacheDebug().providerBody,
        toolsEstimatedTokens: 80,
        previousProviderOutputItems: 2,
        toolResultBudget: {
          ...cacheDebug().providerBody.toolResultBudget,
          replayedToolResultBytes: 100,
        },
        cacheShape: {
          ...cacheDebug().providerBody.cacheShape,
          dynamicInputShare: 0.1,
        },
      },
    }),
  }));

  const report = monitor.analyze();
  assert.equal(report.project.cache.previousResponseReuseCalls, 1);
  assert.equal(report.project.cache.weightedCacheHitRate, 0.9);
  assert.equal(report.project.health.grade, "excellent");
});
