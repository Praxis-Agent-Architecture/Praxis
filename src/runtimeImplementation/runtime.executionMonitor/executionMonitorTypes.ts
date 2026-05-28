/*
 * 文件定位：Agent 运行态实现层 / execution monitor 类型契约。
 * 核心目的：描述缓存、成本和运行健康诊断报告的 public-safe 事实树。
 * 边界：只保留引用、hash、token 指标和结构化 finding；不保存原始 prompt 或 provider body。
 */

import type { PraxisApplicationEvent, PraxisApplicationViewModel } from "../../applicationLayer/applicationContract.js";
import type { AgentModelCacheDebugRecord } from "../praxisRuntimeKernel.js";

export type ExecutionMonitorSeverity = "info" | "warn" | "error";

export type ExecutionMonitorHealthGrade = "excellent" | "healthy" | "degraded" | "poor" | "unknown";

export type ExecutionMonitorTargetPlane =
  | "promptPack"
  | "context"
  | "memory"
  | "tooling"
  | "provider"
  | "runtime"
  | "application"
  | "project"
  | "devdoctor";

export type ExecutionMonitorArtifactPointer = {
  kind: "devdoctor-run" | "application-event" | "application-view" | "runtime-snapshot" | "project-report" | "session-report";
  path?: string;
  eventId?: string;
  invocationId?: string;
  sessionId?: string;
  turnId?: string;
  hash?: string;
};

export type ExecutionMonitorFinding = {
  id: string;
  severity: ExecutionMonitorSeverity;
  targetPlane: ExecutionMonitorTargetPlane;
  title: string;
  detail: string;
  evidence: readonly string[];
  pointers: readonly ExecutionMonitorArtifactPointer[];
  recommendation?: string;
};

export type ExecutionMonitorThresholds = {
  minHealthyCacheHitRate: number;
  minStablePrefixWarmth: number;
  maxDynamicInputShare: number;
  maxToolResultReplayShare: number;
  maxToolDeclarationTokenShare: number;
  maxObservationTokenShare: number;
  maxRecentSessions: number;
};

export type ExecutionMonitorUsageTotals = {
  modelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  nonCachedInputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  estimatedModelCalls: number;
  cacheTelemetryModelCalls: number;
  weightedCacheHitRate?: number;
};

export type ExecutionMonitorCacheShapeSummary = {
  providerStablePrefixEstimatedTokens: number;
  providerDynamicInputEstimatedTokens: number;
  stablePrefixShare: number;
  dynamicInputShare: number;
  stablePrefixHash?: string;
  dynamicPayloadHash?: string;
  toolDeclarationEstimatedTokens: number;
  toolCount: number;
  toolDeclarationTokenShare: number;
  previousProviderOutputItems: number;
  toolResultInputs: number;
  toolResultReplayBytes: number;
  toolResultOriginalBytes: number;
  toolResultReplayShare: number;
};

export type ExecutionMonitorPromptPackSummary = {
  totalEstimatedTokens: number;
  renderedTextEstimatedTokens: number;
  cacheablePrefixEstimatedTokens: number;
  dynamicEstimatedTokens: number;
  segmentCount: number;
  cacheRiskWarnings: readonly string[];
  segments: readonly {
    segmentKind: string;
    cachePolicy: string;
    stability: string;
    estimatedTokens: number;
    segmentHash: string;
    materialCount: number;
    materialRefs: readonly string[];
  }[];
};

export type ExecutionMonitorProviderReuseSummary = {
  providerResponseId?: string;
  previousProviderResponseId?: string;
  previousProviderOutputItems: number;
  reusedPreviousResponse: boolean;
  reusePointerAvailable: boolean;
};

export type ExecutionMonitorModelCallReport = {
  invocationId: string;
  eventId?: string;
  sessionId?: string;
  turnId?: string;
  turnIndex?: number;
  provider?: string;
  carrierId?: string;
  model?: string;
  status: "completed" | "failed" | "unknown";
  usage: ExecutionMonitorUsageTotals;
  observedUsage?: AgentModelCacheDebugRecord["observedUsage"];
  comparisonToPrevious?: AgentModelCacheDebugRecord["comparisonToPrevious"];
  cacheShape?: ExecutionMonitorCacheShapeSummary;
  promptPack?: ExecutionMonitorPromptPackSummary;
  providerReuse: ExecutionMonitorProviderReuseSummary;
  source: ExecutionMonitorArtifactPointer;
  findings: readonly ExecutionMonitorFinding[];
};

export type ExecutionMonitorTurnReport = {
  turnId: string;
  turnIndex?: number;
  modelCalls: readonly ExecutionMonitorModelCallReport[];
  usage: ExecutionMonitorUsageTotals;
  cache: {
    status: "warm" | "partial" | "cold" | "missing-telemetry" | "unknown";
    weightedCacheHitRate?: number;
    stablePrefixChangedCalls: number;
    dynamicPayloadChangedCalls: number;
    providerCacheMissCalls: number;
    previousResponseReuseCalls: number;
  };
  findings: readonly ExecutionMonitorFinding[];
};

export type ExecutionMonitorSessionReport = {
  sessionId: string;
  sourceRunDir?: string;
  turns: readonly ExecutionMonitorTurnReport[];
  usage: ExecutionMonitorUsageTotals;
  cache: {
    weightedCacheHitRate?: number;
    cacheTelemetryCoverage: number;
    providerCacheMissCalls: number;
    previousResponseReuseCalls: number;
    dynamicPayloadDominantCalls: number;
  };
  health: {
    grade: ExecutionMonitorHealthGrade;
    modelErrors: number;
    toolErrors: number;
    applicationErrors: number;
    warnings: number;
  };
  findings: readonly ExecutionMonitorFinding[];
};

export type ExecutionMonitorProjectReport = {
  projectId?: string;
  workspaceRoot?: string;
  sessions: readonly ExecutionMonitorSessionReport[];
  recentSessionLimit: number;
  usage: ExecutionMonitorUsageTotals;
  cache: {
    weightedCacheHitRate?: number;
    cacheTelemetryCoverage: number;
    providerCacheMissCalls: number;
    previousResponseReuseCalls: number;
  };
  health: {
    grade: ExecutionMonitorHealthGrade;
    sessionsAnalyzed: number;
    warnings: number;
    errors: number;
  };
  findings: readonly ExecutionMonitorFinding[];
};

export type ExecutionMonitorReport = {
  kind: "praxis.executionMonitor.report";
  schemaVersion: "0.1.0";
  generatedAt: string;
  source: {
    kind: "devdoctor-run" | "in-memory";
    runDir?: string;
    profileName?: string;
    project?: string;
  };
  thresholds: ExecutionMonitorThresholds;
  project: ExecutionMonitorProjectReport;
  sessions: readonly ExecutionMonitorSessionReport[];
  findings: readonly ExecutionMonitorFinding[];
  artifacts: readonly string[];
  publicSafe: true;
};

export type ExecutionMonitorObserveInput = {
  event?: PraxisApplicationEvent;
  view?: PraxisApplicationViewModel;
  runDir?: string;
};
