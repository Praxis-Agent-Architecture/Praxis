import path from "node:path";

import { ExecutionMonitor, type ExecutionMonitorReport } from "@praxis-ai/praxis";
import type {
  PraxisApplicationEvent,
  PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

import {
  runApplicationPromptPackCacheSmoke,
} from "./runtime_application_promptpack_cache_smoke.js";
import {
  runApplicationProviderHealthSmoke,
} from "./runtime_application_provider_health_smoke.js";

export type RuntimeApplicationExecutionMonitorSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  application: {
    status: "ok" | "failed";
    providerCalls: number;
    cacheEvents: number;
  };
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  events: {
    observed: number;
    observedModelCompleted: number;
    observedFinal: boolean;
  };
  monitor: {
    kind: ExecutionMonitorReport["kind"];
    publicSafe: boolean;
    sourceKind: ExecutionMonitorReport["source"]["kind"];
    sessionsAnalyzed: number;
    modelCalls: number;
    cacheTelemetryCoverage: number;
    weightedCacheHitRate: number | undefined;
    dynamicPayloadChangedCalls: number;
    previousResponseReuseCalls: number;
    healthGrade: string | undefined;
    findingIds: readonly string[];
    hasLowCacheHitFinding: boolean;
    hasDynamicPayloadFinding: boolean;
    promptPackSegmentsIncludeUserTurn: boolean;
    promptPackSegmentsIncludeRecentConversation: boolean;
    artifactCount: number;
  };
  modelFleetMonitor: {
    status: "ok" | "failed";
    modelCalls: number;
    failedCalls: number;
    retryAttempts: number;
    fallbackCalls: number;
    retryableFailures: number;
    nonRetryableFailures: number;
    failureCodes: readonly string[];
    endpointRefs: readonly string[];
    fallbackFromRefs: readonly string[];
    findingIds: readonly string[];
  };
};

export type RuntimeApplicationExecutionMonitorSmokeInput = {
  now?: () => string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function modelCompletedEvents(events: readonly PraxisApplicationEvent[]): readonly PraxisApplicationEvent[] {
  return events.filter((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === "completed"
  );
}

function promptPackSegmentKinds(report: ExecutionMonitorReport): readonly string[] {
  return report.sessions.flatMap((session) =>
    session.turns.flatMap((turn) =>
      turn.modelCalls.flatMap((call) =>
        call.promptPack?.segments.map((segment) => segment.segmentKind) ?? []
      )
    )
  );
}

function modelFleetCalls(report: ExecutionMonitorReport) {
  return report.sessions.flatMap((session) =>
    session.turns.flatMap((turn) =>
      turn.modelCalls.filter((call) => call.modelFleet !== undefined)
    )
  );
}

export async function runApplicationExecutionMonitorSmoke(
  input: RuntimeApplicationExecutionMonitorSmokeInput = {},
): Promise<RuntimeApplicationExecutionMonitorSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const application = await runApplicationPromptPackCacheSmoke({
    now,
    includeApplicationArtifacts: true,
  });
  const providerHealth = await runApplicationProviderHealthSmoke({
    now,
    includeApplicationArtifacts: true,
  });
  const artifacts = application.applicationArtifacts;
  if (artifacts === undefined) {
    throw new Error("Application promptPack cache smoke did not return application artifacts.");
  }

  const monitor = new ExecutionMonitor({
    project: artifacts.view.projectId,
    profileName: "application-execution-monitor-smoke",
    now,
    thresholds: {
      maxDynamicInputShare: 0.02,
    },
  });
  monitor.observeEvents(artifacts.events);
  monitor.observeView(artifacts.view);
  const report = monitor.analyze();
  const completedModelEvents = modelCompletedEvents(artifacts.events);
  const session = report.sessions[0];
  const turnReports = report.sessions.flatMap((item) => item.turns);
  const modelCalls = turnReports.flatMap((turn) => turn.modelCalls);
  const segmentKinds = promptPackSegmentKinds(report);
  const findingIds = report.findings.map((finding) => finding.id);
  const dynamicPayloadChangedCalls = turnReports
    .reduce((sum, turn) => sum + turn.cache.dynamicPayloadChangedCalls, 0);
  const previousResponseReuseCalls = turnReports
    .reduce((sum, turn) => sum + turn.cache.previousResponseReuseCalls, 0);
  const monitorSummary = {
    kind: report.kind,
    publicSafe: report.publicSafe,
    sourceKind: report.source.kind,
    sessionsAnalyzed: report.project.health.sessionsAnalyzed,
    modelCalls: report.project.usage.modelCalls,
    cacheTelemetryCoverage: report.project.cache.cacheTelemetryCoverage,
    weightedCacheHitRate: report.project.cache.weightedCacheHitRate,
    dynamicPayloadChangedCalls,
    previousResponseReuseCalls,
    healthGrade: session?.health.grade,
    findingIds,
    hasLowCacheHitFinding: findingIds.includes("cache.hit-rate.low"),
    hasDynamicPayloadFinding: findingIds.includes("cache.dynamic-payload.large"),
    promptPackSegmentsIncludeUserTurn: segmentKinds.includes("userTurn"),
    promptPackSegmentsIncludeRecentConversation: segmentKinds.includes("recentConversation"),
    artifactCount: report.artifacts.length,
  };
  const providerHealthArtifacts = providerHealth.applicationArtifacts;
  if (providerHealthArtifacts === undefined) {
    throw new Error("Application provider health smoke did not return application artifacts.");
  }
  const modelFleetMonitor = new ExecutionMonitor({
    project: providerHealthArtifacts.retryThenFallback.view.projectId,
    profileName: "application-model-fleet-monitor-smoke",
    now,
  });
  modelFleetMonitor.observeEvents([
    ...providerHealthArtifacts.retryThenFallback.events,
    ...providerHealthArtifacts.nonRetryableFailure.events,
  ]);
  modelFleetMonitor.observeViews([
    providerHealthArtifacts.retryThenFallback.view,
    providerHealthArtifacts.nonRetryableFailure.view,
  ]);
  const modelFleetReport = modelFleetMonitor.analyze();
  const fleetCalls = modelFleetCalls(modelFleetReport);
  const failureCodes = [...new Set(fleetCalls.map((call) => call.modelFleet?.failureCode).filter((value): value is string => value !== undefined))].sort();
  const endpointRefs = [...new Set(fleetCalls.map((call) => call.modelFleet?.endpointRef).filter((value): value is string => value !== undefined))].sort();
  const fallbackFromRefs = [...new Set(fleetCalls.map((call) => call.modelFleet?.fallbackFrom).filter((value): value is string => value !== undefined))].sort();
  const modelFleetFindingIds = modelFleetReport.findings.map((finding) => finding.id);
  const modelFleetMonitorSummary = {
    status: providerHealth.status === "ok" &&
      modelFleetReport.project.usage.modelCalls === 4 &&
      fleetCalls.length === 4 &&
      fleetCalls.filter((call) => call.status === "failed").length === 3 &&
      fleetCalls.filter((call) => (call.modelFleet?.retryAttempt ?? 0) > 0).length === 1 &&
      fleetCalls.filter((call) => call.modelFleet?.fallbackFrom !== undefined).length === 1 &&
      fleetCalls.filter((call) => call.modelFleet?.failureRetryable === true).length === 2 &&
      fleetCalls.filter((call) => call.status === "failed" && call.modelFleet?.failureRetryable !== true).length === 1 &&
      failureCodes.includes("PROVIDER_RATE_LIMITED") &&
      failureCodes.includes("CALLER_FAILED") &&
      endpointRefs.includes("primary") &&
      endpointRefs.includes("fallback") &&
      fallbackFromRefs.includes("primary") &&
      modelFleetFindingIds.includes("model.fleet.retryable-failure") &&
      modelFleetFindingIds.includes("model.fleet.fallback-selected") &&
      modelFleetFindingIds.includes("model.fleet.non-retryable-failure")
      ? "ok"
      : "failed",
    modelCalls: modelFleetReport.project.usage.modelCalls,
    failedCalls: fleetCalls.filter((call) => call.status === "failed").length,
    retryAttempts: fleetCalls.filter((call) => (call.modelFleet?.retryAttempt ?? 0) > 0).length,
    fallbackCalls: fleetCalls.filter((call) => call.modelFleet?.fallbackFrom !== undefined).length,
    retryableFailures: fleetCalls.filter((call) => call.modelFleet?.failureRetryable === true).length,
    nonRetryableFailures: fleetCalls.filter((call) => call.status === "failed" && call.modelFleet?.failureRetryable !== true).length,
    failureCodes,
    endpointRefs,
    fallbackFromRefs,
    findingIds: modelFleetFindingIds,
  } satisfies RuntimeApplicationExecutionMonitorSmokeResult["modelFleetMonitor"];
  const eventSummary = {
    observed: artifacts.events.length,
    observedModelCompleted: completedModelEvents.length,
    observedFinal: artifacts.events.some((event) => event.kind === "final"),
  };
  return {
    status: application.status === "ok" &&
      report.kind === "praxis.executionMonitor.report" &&
      report.publicSafe &&
      report.source.kind === "in-memory" &&
      report.sessions.length === 1 &&
      report.project.health.sessionsAnalyzed === 1 &&
      report.project.usage.modelCalls === 2 &&
      report.project.cache.cacheTelemetryCoverage === 1 &&
      report.project.cache.weightedCacheHitRate === 160 / 450 &&
      modelCalls.length === 2 &&
      dynamicPayloadChangedCalls === 1 &&
      previousResponseReuseCalls === 0 &&
      monitorSummary.hasLowCacheHitFinding &&
      monitorSummary.hasDynamicPayloadFinding &&
      monitorSummary.promptPackSegmentsIncludeUserTurn &&
      monitorSummary.promptPackSegmentsIncludeRecentConversation &&
      eventSummary.observedModelCompleted === 2 &&
      eventSummary.observedFinal &&
      report.artifacts.length === 0 &&
      modelFleetMonitorSummary.status === "ok"
      ? "ok"
      : "failed",
    startedAt,
    finishedAt: now(),
    projectRoot: path.resolve(application.projectRoot),
    application: {
      status: application.status,
      providerCalls: application.providerCalls,
      cacheEvents: application.cacheEvents.length,
    },
    view: {
      status: artifacts.view.status,
      finalOutput: artifacts.view.finalOutput,
      counters: artifacts.view.counters,
    },
    events: eventSummary,
    monitor: monitorSummary,
    modelFleetMonitor: modelFleetMonitorSummary,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationExecutionMonitorSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
