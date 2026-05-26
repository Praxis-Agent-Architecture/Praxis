/*
 * 文件定位：Agent 运行态实现层 / execution monitor 分析器。
 * 核心目的：从 application 事件和 cacheDebug 事实中生成缓存、成本、健康诊断树。
 * 边界：做诊断，不做自动修复，不读取 secret，不保存原始 prompt/provider body。
 */

import type { PraxisApplicationEvent, PraxisApplicationViewModel } from "../../applicationLayer/applicationContract.js";
import type { AgentModelCacheDebugRecord } from "../praxisRuntimeKernel.js";
import type {
  ExecutionMonitorArtifactPointer,
  ExecutionMonitorCacheShapeSummary,
  ExecutionMonitorFinding,
  ExecutionMonitorHealthGrade,
  ExecutionMonitorModelCallReport,
  ExecutionMonitorProjectReport,
  ExecutionMonitorPromptPackSummary,
  ExecutionMonitorReport,
  ExecutionMonitorSessionReport,
  ExecutionMonitorSeverity,
  ExecutionMonitorTargetPlane,
  ExecutionMonitorThresholds,
  ExecutionMonitorTurnReport,
  ExecutionMonitorUsageTotals,
} from "./executionMonitorTypes.js";

export const DEFAULT_EXECUTION_MONITOR_THRESHOLDS: ExecutionMonitorThresholds = {
  minHealthyCacheHitRate: 0.75,
  minStablePrefixWarmth: 0.6,
  maxDynamicInputShare: 0.35,
  maxToolResultReplayShare: 0.4,
  maxToolDeclarationTokenShare: 0.3,
  maxObservationTokenShare: 0.25,
  maxRecentSessions: 10,
};

export type AnalyzeExecutionMonitorInput = {
  events?: readonly PraxisApplicationEvent[];
  views?: readonly PraxisApplicationViewModel[];
  generatedAt?: string;
  runDir?: string;
  profileName?: string;
  project?: string;
  thresholds?: Partial<ExecutionMonitorThresholds>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mergeThresholds(input: Partial<ExecutionMonitorThresholds> | undefined): ExecutionMonitorThresholds {
  return { ...DEFAULT_EXECUTION_MONITOR_THRESHOLDS, ...input };
}

function emptyUsage(): ExecutionMonitorUsageTotals {
  return {
    modelCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    nonCachedInputTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    estimatedModelCalls: 0,
    cacheTelemetryModelCalls: 0,
  };
}

function finalizeUsage(usage: ExecutionMonitorUsageTotals): ExecutionMonitorUsageTotals {
  const inputTokens = usage.inputTokens;
  return {
    ...usage,
    nonCachedInputTokens: Math.max(0, usage.nonCachedInputTokens || inputTokens - usage.cachedInputTokens),
    weightedCacheHitRate: inputTokens > 0 ? usage.cachedInputTokens / inputTokens : undefined,
  };
}

function addUsage(target: ExecutionMonitorUsageTotals, next: Partial<ExecutionMonitorUsageTotals>): void {
  target.modelCalls += next.modelCalls ?? 0;
  target.inputTokens += next.inputTokens ?? 0;
  target.cachedInputTokens += next.cachedInputTokens ?? 0;
  target.nonCachedInputTokens += next.nonCachedInputTokens ?? 0;
  target.outputTokens += next.outputTokens ?? 0;
  target.thinkingTokens += next.thinkingTokens ?? 0;
  target.totalTokens += next.totalTokens ?? 0;
  target.estimatedModelCalls += next.estimatedModelCalls ?? 0;
  target.cacheTelemetryModelCalls += next.cacheTelemetryModelCalls ?? 0;
}

function finding(input: {
  id: string;
  severity: ExecutionMonitorSeverity;
  targetPlane: ExecutionMonitorTargetPlane;
  title: string;
  detail: string;
  evidence?: readonly string[];
  pointers?: readonly ExecutionMonitorArtifactPointer[];
  recommendation?: string;
}): ExecutionMonitorFinding {
  return {
    id: input.id,
    severity: input.severity,
    targetPlane: input.targetPlane,
    title: input.title,
    detail: input.detail,
    evidence: input.evidence ?? [],
    pointers: input.pointers ?? [],
    recommendation: input.recommendation,
  };
}

function readCacheDebug(metadata: Record<string, unknown>): AgentModelCacheDebugRecord | undefined {
  const candidate = metadata.cacheDebug;
  if (!isRecord(candidate) || candidate.kind !== "praxis.modelCall.cacheDebug") return undefined;
  return candidate as AgentModelCacheDebugRecord;
}

function modelCallUsage(metadata: Record<string, unknown>, cacheDebug: AgentModelCacheDebugRecord | undefined): ExecutionMonitorUsageTotals {
  const usage = isRecord(metadata.usage) ? metadata.usage : {};
  const inputTokens = asNumber(usage.inputTokens) ?? cacheDebug?.observedUsage?.inputTokens ?? 0;
  const cachedInputTokens = asNumber(usage.cachedInputTokens) ?? cacheDebug?.observedUsage?.cachedInputTokens ?? 0;
  const nonCachedInputTokens = cacheDebug?.observedUsage?.nonCachedInputTokens ?? Math.max(0, inputTokens - cachedInputTokens);
  return finalizeUsage({
    modelCalls: 1,
    inputTokens,
    cachedInputTokens,
    nonCachedInputTokens,
    outputTokens: asNumber(usage.outputTokens) ?? 0,
    thinkingTokens: asNumber(usage.thinkingTokens) ?? 0,
    totalTokens: asNumber(usage.totalTokens) ?? 0,
    estimatedModelCalls: usage.estimated === true ? 1 : 0,
    cacheTelemetryModelCalls: inputTokens > 0 && asNumber(usage.cachedInputTokens) !== undefined ? 1 : 0,
  });
}

function summarizePromptPack(cacheDebug: AgentModelCacheDebugRecord): ExecutionMonitorPromptPackSummary {
  return {
    totalEstimatedTokens: cacheDebug.promptPack.totalEstimatedTokens,
    renderedTextEstimatedTokens: cacheDebug.promptPack.renderedTextEstimatedTokens,
    cacheablePrefixEstimatedTokens: cacheDebug.promptPack.cacheablePrefixEstimatedTokens,
    dynamicEstimatedTokens: cacheDebug.promptPack.dynamicEstimatedTokens,
    segmentCount: cacheDebug.promptPack.segmentCount,
    cacheRiskWarnings: cacheDebug.promptPack.cacheRiskWarnings,
    segments: cacheDebug.promptPack.segments.map((segment) => ({
      segmentKind: segment.segmentKind,
      cachePolicy: segment.cachePolicy,
      stability: segment.stability,
      estimatedTokens: segment.estimatedTokens,
      segmentHash: segment.segmentHash,
      materialCount: segment.materialCount,
      materialRefs: segment.materialRefs,
    })),
  };
}

function segmentTokens(cacheDebug: AgentModelCacheDebugRecord, includes: readonly string[]): number {
  return cacheDebug.promptPack.segments
    .filter((segment) => includes.some((needle) => segment.segmentKind.toLowerCase().includes(needle)))
    .reduce((sum, segment) => sum + segment.estimatedTokens, 0);
}

function summarizeCacheShape(cacheDebug: AgentModelCacheDebugRecord): ExecutionMonitorCacheShapeSummary {
  const body = cacheDebug.providerBody;
  const replayBytes = body.toolResultBudget.replayedToolResultBytes;
  const originalBytes = body.toolResultBudget.originalToolResultBytes;
  return {
    providerStablePrefixEstimatedTokens: body.cacheShape.providerStablePrefixEstimatedTokens,
    providerDynamicInputEstimatedTokens: body.cacheShape.providerDynamicInputEstimatedTokens,
    stablePrefixShare: body.cacheShape.stablePrefixShare,
    dynamicInputShare: body.cacheShape.dynamicInputShare,
    stablePrefixHash: body.cacheShape.stablePrefixHash,
    dynamicPayloadHash: body.cacheShape.dynamicPayloadHash,
    toolDeclarationEstimatedTokens: body.toolsEstimatedTokens,
    toolCount: body.toolCount,
    toolDeclarationTokenShare: body.estimatedTokens > 0 ? body.toolsEstimatedTokens / body.estimatedTokens : 0,
    previousProviderOutputItems: body.previousProviderOutputItems,
    toolResultInputs: body.toolResultInputs,
    toolResultReplayBytes: replayBytes,
    toolResultOriginalBytes: originalBytes,
    toolResultReplayShare: originalBytes > 0 ? replayBytes / originalBytes : 0,
  };
}

function modelFindings(input: {
  event: PraxisApplicationEvent;
  metadata: Record<string, unknown>;
  cacheDebug?: AgentModelCacheDebugRecord;
  usage: ExecutionMonitorUsageTotals;
  cacheShape?: ExecutionMonitorCacheShapeSummary;
  thresholds: ExecutionMonitorThresholds;
  pointer: ExecutionMonitorArtifactPointer;
}): ExecutionMonitorFinding[] {
  const findings: ExecutionMonitorFinding[] = [];
  const cacheDebug = input.cacheDebug;
  if (input.metadata.modelPhase === "failed") {
    findings.push(finding({
      id: "model.call.failed",
      severity: "error",
      targetPlane: "provider",
      title: "Model call failed",
      detail: input.event.message,
      pointers: [input.pointer],
      recommendation: "Inspect provider routing, auth, and request compatibility before judging cache behavior.",
    }));
  }
  if (cacheDebug === undefined) {
    findings.push(finding({
      id: "cache.telemetry.missing-cache-debug",
      severity: "warn",
      targetPlane: "provider",
      title: "Cache debug payload is missing",
      detail: "The model event did not include Praxis cacheDebug, so the monitor cannot explain cache shape.",
      pointers: [input.pointer],
      recommendation: "Ensure model progress events preserve cacheDebug from the runtime kernel.",
    }));
    return findings;
  }
  const observed = cacheDebug.observedUsage;
  if (observed === undefined || observed.diagnosis === "no-cache-telemetry") {
    findings.push(finding({
      id: "cache.provider.cached-token-telemetry-missing",
      severity: "warn",
      targetPlane: "provider",
      title: "Provider cached-token telemetry is missing",
      detail: "The provider usage payload did not expose cached input tokens for this model call.",
      evidence: observed?.reasons ?? [],
      pointers: [input.pointer],
      recommendation: "Prefer providers/adapters that expose cached input tokens, or mark the route as telemetry-limited.",
    }));
  }
  if (observed?.diagnosis === "provider-cache-miss-with-stable-prefix") {
    findings.push(finding({
      id: "cache.provider.stable-prefix-miss",
      severity: "warn",
      targetPlane: "provider",
      title: "Stable prefix did not appear to hit provider cache",
      detail: "Praxis saw a stable prefix, but provider cached tokens were absent or too low.",
      evidence: observed.reasons,
      pointers: [input.pointer],
      recommendation: "Check provider endpoint/cache support and whether the adapter maps stable instructions/tools into a cacheable prefix.",
    }));
  }
  if ((observed?.cacheHitRate ?? input.usage.weightedCacheHitRate ?? 1) < input.thresholds.minHealthyCacheHitRate && input.usage.inputTokens > 0) {
    findings.push(finding({
      id: "cache.hit-rate.low",
      severity: "warn",
      targetPlane: "promptPack",
      title: "Cache hit rate is low",
      detail: "The weighted cache hit rate is below the configured healthy threshold.",
      evidence: [`hitRate=${(observed?.cacheHitRate ?? input.usage.weightedCacheHitRate ?? 0).toFixed(3)}`],
      pointers: [input.pointer],
      recommendation: "Compare stable prefix hashes across adjacent turns and move volatile content out of stable sections.",
    }));
  }
  if (observed?.stablePrefixWarmthEstimate !== undefined && observed.stablePrefixWarmthEstimate < input.thresholds.minStablePrefixWarmth) {
    findings.push(finding({
      id: "cache.stable-prefix.not-warm",
      severity: "warn",
      targetPlane: "provider",
      title: "Stable prefix warmth is low",
      detail: "Cached tokens cover too little of the estimated stable provider prefix.",
      evidence: [`stablePrefixWarmth=${observed.stablePrefixWarmthEstimate.toFixed(3)}`],
      pointers: [input.pointer],
      recommendation: "Verify provider cache controls and keep system/tool declarations byte-stable across turns.",
    }));
  }
  if ((input.cacheShape?.dynamicInputShare ?? 0) > input.thresholds.maxDynamicInputShare) {
    findings.push(finding({
      id: "cache.dynamic-payload.large",
      severity: "warn",
      targetPlane: "context",
      title: "Dynamic payload is dominating the request",
      detail: "The provider dynamic input share exceeds the configured threshold.",
      evidence: [`dynamicInputShare=${(input.cacheShape?.dynamicInputShare ?? 0).toFixed(3)}`],
      pointers: [input.pointer],
      recommendation: "Move reusable context into summaries or stable project materials; keep per-turn observations compact.",
    }));
  }
  if ((input.cacheShape?.toolDeclarationTokenShare ?? 0) > input.thresholds.maxToolDeclarationTokenShare) {
    findings.push(finding({
      id: "cache.tool-declarations.large",
      severity: "warn",
      targetPlane: "tooling",
      title: "Tool declarations are large",
      detail: "Tool schema/declaration tokens consume a large share of the provider body.",
      evidence: [
        `toolCount=${input.cacheShape?.toolCount ?? 0}`,
        `toolDeclarationTokenShare=${(input.cacheShape?.toolDeclarationTokenShare ?? 0).toFixed(3)}`,
      ],
      pointers: [input.pointer],
      recommendation: "Use a narrower basetool profile or profile-aware descriptions for this harness.",
    }));
  }
  if ((input.cacheShape?.toolResultReplayShare ?? 0) > input.thresholds.maxToolResultReplayShare) {
    findings.push(finding({
      id: "cache.tool-result-replay.large",
      severity: "warn",
      targetPlane: "runtime",
      title: "Tool result replay is large",
      detail: "A large share of previous tool result bytes is being replayed into the request.",
      evidence: [
        `replayedBytes=${input.cacheShape?.toolResultReplayBytes ?? 0}`,
        `originalBytes=${input.cacheShape?.toolResultOriginalBytes ?? 0}`,
      ],
      pointers: [input.pointer],
      recommendation: "Compact repeated tool observations and prefer stable artifacts or summaries for large outputs.",
    }));
  }
  const observationTokens = segmentTokens(cacheDebug, ["observation"]);
  if (cacheDebug.promptPack.totalEstimatedTokens > 0 && observationTokens / cacheDebug.promptPack.totalEstimatedTokens > input.thresholds.maxObservationTokenShare) {
    findings.push(finding({
      id: "cache.observations.large",
      severity: "warn",
      targetPlane: "context",
      title: "Observation segments are large",
      detail: "Observation tokens consume a large share of the prompt pack.",
      evidence: [`observationTokenShare=${(observationTokens / cacheDebug.promptPack.totalEstimatedTokens).toFixed(3)}`],
      pointers: [input.pointer],
      recommendation: "Fold large observations into artifacts or short summaries before the next turn.",
    }));
  }
  if (!cacheDebug.promptPack.segments.some((segment) => segment.segmentKind === "sessionSummary")) {
    findings.push(finding({
      id: "cache.session-summary.missing",
      severity: "info",
      targetPlane: "context",
      title: "Session summary segment is missing",
      detail: "The prompt pack did not include a sessionSummary segment.",
      pointers: [input.pointer],
      recommendation: "Long-running applications should provide a compact session summary to reduce transcript churn.",
    }));
  }
  for (const warning of cacheDebug.promptPack.cacheRiskWarnings) {
    findings.push(finding({
      id: "cache.prompt-pack.risk-warning",
      severity: "warn",
      targetPlane: "promptPack",
      title: "PromptPack cache risk warning",
      detail: warning,
      pointers: [input.pointer],
    }));
  }
  return findings;
}

function modelCallFromEvent(event: PraxisApplicationEvent, thresholds: ExecutionMonitorThresholds, runDir?: string): ExecutionMonitorModelCallReport | undefined {
  if (event.kind !== "model" || !isRecord(event.metadata)) return undefined;
  const metadata = event.metadata;
  const phase = asString(metadata.modelPhase);
  if (phase !== "completed" && phase !== "failed") return undefined;
  const cacheDebug = readCacheDebug(metadata);
  const pointer: ExecutionMonitorArtifactPointer = {
    kind: "application-event",
    path: runDir === undefined ? undefined : `${runDir}/events.jsonl`,
    eventId: event.eventId,
    invocationId: asString(metadata.invocationId),
    sessionId: event.sessionId,
    turnId: event.turnId,
  };
  const usage = modelCallUsage(metadata, cacheDebug);
  const cacheShape = cacheDebug === undefined ? undefined : summarizeCacheShape(cacheDebug);
  return {
    invocationId: asString(metadata.invocationId) ?? event.eventId,
    eventId: event.eventId,
    sessionId: event.sessionId,
    turnId: event.turnId,
    turnIndex: asNumber(metadata.turnIndex),
    provider: asString(metadata.provider),
    carrierId: asString(metadata.carrierId),
    model: asString(metadata.model),
    status: phase,
    usage,
    observedUsage: cacheDebug?.observedUsage,
    comparisonToPrevious: cacheDebug?.comparisonToPrevious,
    cacheShape,
    promptPack: cacheDebug === undefined ? undefined : summarizePromptPack(cacheDebug),
    providerReuse: {
      providerResponseId: asString(metadata.providerResponseId),
      previousProviderResponseId: asString(metadata.previousProviderResponseId),
      previousProviderOutputItems: cacheDebug?.providerBody.previousProviderOutputItems ?? 0,
      reusedPreviousResponse: asString(metadata.previousProviderResponseId) !== undefined || (cacheDebug?.providerBody.previousProviderOutputItems ?? 0) > 0,
      reusePointerAvailable: asString(metadata.providerResponseId) !== undefined,
    },
    source: pointer,
    findings: modelFindings({ event, metadata, cacheDebug, usage, cacheShape, thresholds, pointer }),
  };
}

function cacheStatus(usage: ExecutionMonitorUsageTotals): ExecutionMonitorTurnReport["cache"]["status"] {
  if (usage.modelCalls === 0) return "unknown";
  if (usage.cacheTelemetryModelCalls === 0) return "missing-telemetry";
  const hitRate = usage.weightedCacheHitRate ?? 0;
  if (hitRate >= 0.75) return "warm";
  if (hitRate > 0) return "partial";
  return "cold";
}

function groupBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const current = grouped.get(groupKey);
    if (current === undefined) grouped.set(groupKey, [value]);
    else current.push(value);
  }
  return grouped;
}

function turnReport(turnId: string, calls: readonly ExecutionMonitorModelCallReport[]): ExecutionMonitorTurnReport {
  const usage = emptyUsage();
  for (const call of calls) addUsage(usage, call.usage);
  const finalized = finalizeUsage(usage);
  const findings = calls.flatMap((call) => call.findings);
  return {
    turnId,
    turnIndex: calls.find((call) => call.turnIndex !== undefined)?.turnIndex,
    modelCalls: calls,
    usage: finalized,
    cache: {
      status: cacheStatus(finalized),
      weightedCacheHitRate: finalized.weightedCacheHitRate,
      stablePrefixChangedCalls: calls.filter((call) => call.comparisonToPrevious?.stablePrefixChanged === true).length,
      dynamicPayloadChangedCalls: calls.filter((call) => call.comparisonToPrevious?.dynamicPayloadChanged === true).length,
      providerCacheMissCalls: calls.filter((call) => call.observedUsage?.diagnosis === "provider-cache-miss-with-stable-prefix").length,
      previousResponseReuseCalls: calls.filter((call) => call.providerReuse.reusedPreviousResponse).length,
    },
    findings,
  };
}

function healthGrade(warnings: number, errors: number, modelCalls: number): ExecutionMonitorHealthGrade {
  if (modelCalls === 0 && warnings === 0 && errors === 0) return "unknown";
  if (errors > 0) return "poor";
  if (warnings > Math.max(2, modelCalls)) return "degraded";
  if (warnings > 0) return "healthy";
  return "excellent";
}

function sessionReport(sessionId: string, calls: readonly ExecutionMonitorModelCallReport[], events: readonly PraxisApplicationEvent[], runDir?: string): ExecutionMonitorSessionReport {
  const usage = emptyUsage();
  for (const call of calls) addUsage(usage, call.usage);
  const finalized = finalizeUsage(usage);
  const turns = [...groupBy(calls, (call) => call.turnId ?? "unknown-turn").entries()]
    .map(([turnId, groupedCalls]) => turnReport(turnId, groupedCalls));
  const modelErrors = calls.filter((call) => call.status === "failed").length;
  const toolErrors = events.filter((event) => event.sessionId === sessionId && event.kind === "tool" && event.status === "failed").length;
  const applicationErrors = events.filter((event) => event.sessionId === sessionId && event.kind === "error").length;
  const findings = calls.flatMap((call) => call.findings);
  if (calls.length === 0) {
    findings.push(finding({
      id: "monitor.session.no-model-calls",
      severity: "info",
      targetPlane: "runtime",
      title: "No completed model calls found",
      detail: "This session has no completed/failed model call event for cache diagnosis.",
      pointers: [{ kind: "session-report", sessionId, path: runDir }],
    }));
  }
  const warnings = findings.filter((item) => item.severity === "warn").length;
  const errors = findings.filter((item) => item.severity === "error").length + applicationErrors + toolErrors + modelErrors;
  return {
    sessionId,
    sourceRunDir: runDir,
    turns,
    usage: finalized,
    cache: {
      weightedCacheHitRate: finalized.weightedCacheHitRate,
      cacheTelemetryCoverage: finalized.modelCalls > 0 ? finalized.cacheTelemetryModelCalls / finalized.modelCalls : 0,
      providerCacheMissCalls: calls.filter((call) => call.observedUsage?.diagnosis === "provider-cache-miss-with-stable-prefix").length,
      previousResponseReuseCalls: calls.filter((call) => call.providerReuse.reusedPreviousResponse).length,
      dynamicPayloadDominantCalls: calls.filter((call) => call.observedUsage?.diagnosis === "dynamic-payload-dominates").length,
    },
    health: {
      grade: healthGrade(warnings, errors, finalized.modelCalls),
      modelErrors,
      toolErrors,
      applicationErrors,
      warnings,
    },
    findings,
  };
}

function latestView(views: readonly PraxisApplicationViewModel[]): PraxisApplicationViewModel | undefined {
  return views.at(-1);
}

function projectReport(input: {
  sessions: readonly ExecutionMonitorSessionReport[];
  views: readonly PraxisApplicationViewModel[];
  thresholds: ExecutionMonitorThresholds;
}): ExecutionMonitorProjectReport {
  const last = latestView(input.views);
  const usage = emptyUsage();
  for (const session of input.sessions) addUsage(usage, session.usage);
  const finalized = finalizeUsage(usage);
  const findings = input.sessions.flatMap((session) => session.findings);
  if (input.sessions.length === 0) {
    findings.push(finding({
      id: "monitor.project.no-sessions",
      severity: "info",
      targetPlane: "project",
      title: "No sessions were available for aggregation",
      detail: "The monitor did not find any session with model events in the selected artifacts.",
      recommendation: "Run devdoctor first, or point --run at a directory with events.jsonl and views.jsonl.",
    }));
  }
  const warnings = findings.filter((item) => item.severity === "warn").length;
  const errors = findings.filter((item) => item.severity === "error").length;
  return {
    projectId: last?.projectId,
    workspaceRoot: last?.workspaceRoot,
    sessions: input.sessions,
    recentSessionLimit: input.thresholds.maxRecentSessions,
    usage: finalized,
    cache: {
      weightedCacheHitRate: finalized.weightedCacheHitRate,
      cacheTelemetryCoverage: finalized.modelCalls > 0 ? finalized.cacheTelemetryModelCalls / finalized.modelCalls : 0,
      providerCacheMissCalls: input.sessions.reduce((sum, session) => sum + session.cache.providerCacheMissCalls, 0),
      previousResponseReuseCalls: input.sessions.reduce((sum, session) => sum + session.cache.previousResponseReuseCalls, 0),
    },
    health: {
      grade: healthGrade(warnings, errors, finalized.modelCalls),
      sessionsAnalyzed: input.sessions.length,
      warnings,
      errors,
    },
    findings,
  };
}

export function analyzeExecutionMonitor(input: AnalyzeExecutionMonitorInput): ExecutionMonitorReport {
  const thresholds = mergeThresholds(input.thresholds);
  const events = input.events ?? [];
  const views = input.views ?? [];
  const calls = events
    .map((event) => modelCallFromEvent(event, thresholds, input.runDir))
    .filter((call): call is ExecutionMonitorModelCallReport => call !== undefined);
  const sessionIdsFromCalls = [...new Set(calls.map((call) => call.sessionId).filter((value): value is string => value !== undefined))];
  const sessionIdsFromViews = [...new Set(views.map((view) => view.sessionId))];
  const sessionIds = [...new Set([...sessionIdsFromCalls, ...sessionIdsFromViews])].slice(-thresholds.maxRecentSessions);
  const sessions = sessionIds.map((sessionId) => sessionReport(
    sessionId,
    calls.filter((call) => call.sessionId === sessionId || (call.sessionId === undefined && sessionId === "unknown-session")),
    events,
    input.runDir,
  ));
  const project = projectReport({ sessions, views, thresholds });
  return {
    kind: "praxis.executionMonitor.report",
    schemaVersion: "0.1.0",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    source: {
      kind: input.runDir === undefined ? "in-memory" : "devdoctor-run",
      runDir: input.runDir,
      profileName: input.profileName,
      project: input.project,
    },
    thresholds,
    project,
    sessions,
    findings: project.findings,
    artifacts: input.runDir === undefined
      ? []
      : [
          "events.jsonl",
          "views.jsonl",
          "execution-monitor.json",
          "execution-monitor.md",
        ],
    publicSafe: true,
  };
}

