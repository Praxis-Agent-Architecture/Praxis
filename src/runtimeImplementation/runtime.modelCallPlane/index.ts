/*
 * Runtime foundation / model-call read surface.
 * Purpose: normalize existing model invocation, provider fleet, usage, and cache facts into a public-safe report.
 * Boundary: read-only inspection only; does not invoke providers, choose routes, or replace modelAdapter/executionMonitor semantics.
 */

import type { MainLoopStepRecord } from "../../executionEngine/coreLogic/mainLoop.js";
import type {
  RuntimeInvocationRecord,
  RuntimePublicSafeErrorRecord,
  RuntimeSessionSnapshot,
} from "../runtimeSessionStateEventStore.js";

export type RuntimeModelCallSourceKind = "application-events" | "in-memory" | "sqlite" | "snapshot" | (string & {});

export type RuntimeModelCallApplicationEvent = {
  eventId: string;
  kind: string;
  status?: string;
  message?: string;
  createdAt: string;
  sessionId?: string;
  runtimeId?: string;
  turnId?: string;
  publicSafe?: true;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeModelCallStatus = "started" | "completed" | "failed" | "unknown";

export type RuntimeModelCallUsage = {
  inputTokens: number | undefined;
  cachedInputTokens: number | undefined;
  nonCachedInputTokens: number | undefined;
  outputTokens: number | undefined;
  thinkingTokens: number | undefined;
  totalTokens: number | undefined;
  cacheHitRate: number | undefined;
  source: string | undefined;
  estimated: boolean | undefined;
  publicSafe: true;
};

export type RuntimeModelCallCache = {
  promptCacheKey: string | undefined;
  totalEstimatedTokens: number | undefined;
  cacheablePrefixEstimatedTokens: number | undefined;
  dynamicEstimatedTokens: number | undefined;
  segmentCount: number | undefined;
  providerStablePrefixEstimatedTokens: number | undefined;
  providerDynamicInputEstimatedTokens: number | undefined;
  stablePrefixShare: number | undefined;
  dynamicInputShare: number | undefined;
  stablePrefixHash: string | undefined;
  dynamicPayloadHash: string | undefined;
  instructionsHash: string | undefined;
  inputHash: string | undefined;
  previousProviderOutputItems: number | undefined;
  toolResultInputs: number | undefined;
  observedUsageDiagnosis: string | undefined;
  stablePrefixWarmthEstimate: number | undefined;
  comparisonStablePrefixChanged: boolean | undefined;
  comparisonDynamicPayloadChanged: boolean | undefined;
  comparisonInstructionsChanged: boolean | undefined;
  comparisonToolsChanged: boolean | undefined;
  publicSafe: true;
};

export type RuntimeModelCallFleet = {
  endpointRef: string | undefined;
  fallbackFrom: string | undefined;
  adaptiveSelection: boolean | undefined;
  capabilitySelection: boolean | undefined;
  requiredCapabilities: readonly string[];
  retryAttempt: number | undefined;
  maxRetries: number | undefined;
  failureCode: string | undefined;
  failureRetryable: boolean | undefined;
  publicSafe: true;
};

export type RuntimeModelCallProvider = {
  provider: string | undefined;
  carrierId: string | undefined;
  model: string | undefined;
  providerResponseId: string | undefined;
  previousProviderResponseId: string | undefined;
  reusedPreviousResponse: boolean;
  publicSafe: true;
};

export type RuntimeModelCallRecord = {
  callId: string;
  invocationId: string | undefined;
  eventId: string | undefined;
  sessionId: string | undefined;
  runtimeId: string | undefined;
  turnId: string | undefined;
  createdAt: string;
  ok: boolean | undefined;
  status: RuntimeModelCallStatus;
  turnIndex: number | undefined;
  stepIndex: number | undefined;
  promptPackId: string | undefined;
  loweringId: string | undefined;
  provider: RuntimeModelCallProvider;
  usage: RuntimeModelCallUsage;
  cache: RuntimeModelCallCache;
  fleet: RuntimeModelCallFleet;
  refs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  publicSafe: true;
};

export type RuntimeModelCallReport = {
  kind: "praxis.runtime.modelCall.report";
  publicSafe: true;
  sourceKind: RuntimeModelCallSourceKind;
  session: {
    sessionId: string | undefined;
    runtimeId: string | undefined;
    status: string | undefined;
  };
  counts: {
    modelCalls: number;
    completed: number;
    failed: number;
    started: number;
    withUsage: number;
    withCacheDebug: number;
    cacheTelemetryModelCalls: number;
    withProviderResponseId: number;
    fallbackCalls: number;
    retryAttempts: number;
    retryableFailures: number;
    nonRetryableFailures: number;
    errors: number;
  };
  usageTotals: {
    inputTokens: number;
    cachedInputTokens: number;
    nonCachedInputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    totalTokens: number;
    weightedCacheHitRate: number | undefined;
  };
  coverage: {
    hasSession: boolean;
    hasRuntimeModelInvocations: boolean;
    hasApplicationModelEvents: boolean;
    hasUsage: boolean;
    hasCacheDebug: boolean;
    hasCacheTelemetry: boolean;
    hasProviderResponseIds: boolean;
    hasModelFleetEvidence: boolean;
    hasFallbackEvidence: boolean;
    hasRetryEvidence: boolean;
    hasFailures: boolean;
  };
  providers: readonly string[];
  carrierIds: readonly string[];
  models: readonly string[];
  endpointRefs: readonly string[];
  failureCodes: readonly string[];
  cacheDiagnoses: readonly string[];
  promptCacheKeys: readonly string[];
  modelCalls: readonly RuntimeModelCallRecord[];
};

export type RuntimeModelCallIndex = {
  kind: "praxis.runtime.modelCall.index";
  publicSafe: true;
  sourceKind: RuntimeModelCallSourceKind;
  totalModelCalls: number;
  byStatus: Readonly<Record<string, number>>;
  byProvider: Readonly<Record<string, number>>;
  byCarrierId: Readonly<Record<string, number>>;
  byEndpointRef: Readonly<Record<string, number>>;
  byFailureCode: Readonly<Record<string, number>>;
  byCacheDiagnosis: Readonly<Record<string, number>>;
  promptCacheKeys: readonly string[];
};

export type RuntimeModelCallQuery = {
  status?: RuntimeModelCallStatus;
  provider?: string;
  carrierId?: string;
  model?: string;
  endpointRef?: string;
  fallbackFrom?: string;
  failureCode?: string;
  cacheDiagnosis?: string;
  hasCacheDebug?: boolean;
  ref?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  limit?: number;
};

export type RuntimeModelCallQueryResult = {
  kind: "praxis.runtime.modelCall.queryResult";
  publicSafe: true;
  sourceKind: RuntimeModelCallSourceKind;
  query: RuntimeModelCallQuery;
  totalModelCalls: number;
  matchedModelCalls: number;
  returnedModelCalls: number;
  modelCalls: readonly RuntimeModelCallRecord[];
};

export type CreateRuntimeModelCallReportInput = {
  sourceKind?: RuntimeModelCallSourceKind;
  snapshot?: RuntimeSessionSnapshot;
  applicationEvents?: readonly RuntimeModelCallApplicationEvent[];
};

export type QueryRuntimeModelCallsInput = {
  report: RuntimeModelCallReport;
  query?: RuntimeModelCallQuery;
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("credential") ||
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("authorization") ||
    normalized === "auth" ||
    normalized.endsWith("auth");
}

function publicSafeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicSafeValue);
  if (isRecord(value)) return publicSafeMetadata(value);
  return value;
}

function publicSafeMetadata(metadata: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    output[key] = isSensitiveKey(key) ? "[redacted]" : publicSafeValue(value);
  }
  return output;
}

function nested(record: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function uniqueSorted(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))].sort();
}

function refs(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined && value.trim().length > 0))];
}

function increment(map: Map<string, number>, key: string | undefined): void {
  if (key === undefined || key.trim().length === 0) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...map.entries()].sort((left, right) => left[0].localeCompare(right[0])));
}

function numberLimit(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.floor(value));
}

function usageFromMetadata(metadata: Readonly<Record<string, unknown>>, cacheDebug: Readonly<Record<string, unknown>>): RuntimeModelCallUsage {
  const usage = nested(metadata, "usage");
  const observedUsage = nested(cacheDebug, "observedUsage");
  const inputTokens = numberValue(usage.inputTokens) ?? numberValue(observedUsage.inputTokens);
  const cachedInputTokens = numberValue(usage.cachedInputTokens) ?? numberValue(observedUsage.cachedInputTokens);
  const nonCachedInputTokens = numberValue(observedUsage.nonCachedInputTokens) ??
    (inputTokens === undefined || cachedInputTokens === undefined ? undefined : Math.max(0, inputTokens - cachedInputTokens));
  return {
    inputTokens,
    cachedInputTokens,
    nonCachedInputTokens,
    outputTokens: numberValue(usage.outputTokens),
    thinkingTokens: numberValue(usage.thinkingTokens),
    totalTokens: numberValue(usage.totalTokens),
    cacheHitRate: numberValue(observedUsage.cacheHitRate) ??
      (inputTokens !== undefined && inputTokens > 0 && cachedInputTokens !== undefined ? cachedInputTokens / inputTokens : undefined),
    source: stringValue(usage.source),
    estimated: booleanValue(usage.estimated),
    publicSafe: true,
  };
}

function emptyUsage(): RuntimeModelCallUsage {
  return {
    inputTokens: undefined,
    cachedInputTokens: undefined,
    nonCachedInputTokens: undefined,
    outputTokens: undefined,
    thinkingTokens: undefined,
    totalTokens: undefined,
    cacheHitRate: undefined,
    source: undefined,
    estimated: undefined,
    publicSafe: true,
  };
}

function cacheFromMetadata(metadata: Readonly<Record<string, unknown>>): RuntimeModelCallCache {
  const cacheDebug = nested(metadata, "cacheDebug");
  const promptPack = nested(cacheDebug, "promptPack");
  const providerBody = nested(cacheDebug, "providerBody");
  const cacheShape = nested(providerBody, "cacheShape");
  const fingerprints = nested(providerBody, "fingerprints");
  const observedUsage = nested(cacheDebug, "observedUsage");
  const comparison = nested(cacheDebug, "comparisonToPrevious");
  return {
    promptCacheKey: stringValue(cacheDebug.promptCacheKey),
    totalEstimatedTokens: numberValue(promptPack.totalEstimatedTokens),
    cacheablePrefixEstimatedTokens: numberValue(promptPack.cacheablePrefixEstimatedTokens),
    dynamicEstimatedTokens: numberValue(promptPack.dynamicEstimatedTokens),
    segmentCount: numberValue(promptPack.segmentCount),
    providerStablePrefixEstimatedTokens: numberValue(cacheShape.providerStablePrefixEstimatedTokens),
    providerDynamicInputEstimatedTokens: numberValue(cacheShape.providerDynamicInputEstimatedTokens),
    stablePrefixShare: numberValue(cacheShape.stablePrefixShare),
    dynamicInputShare: numberValue(cacheShape.dynamicInputShare),
    stablePrefixHash: stringValue(cacheShape.stablePrefixHash),
    dynamicPayloadHash: stringValue(cacheShape.dynamicPayloadHash),
    instructionsHash: stringValue(fingerprints.instructionsHash),
    inputHash: stringValue(fingerprints.inputHash),
    previousProviderOutputItems: numberValue(providerBody.previousProviderOutputItems),
    toolResultInputs: numberValue(providerBody.toolResultInputs),
    observedUsageDiagnosis: stringValue(observedUsage.diagnosis),
    stablePrefixWarmthEstimate: numberValue(observedUsage.stablePrefixWarmthEstimate),
    comparisonStablePrefixChanged: booleanValue(comparison.stablePrefixChanged),
    comparisonDynamicPayloadChanged: booleanValue(comparison.dynamicPayloadChanged),
    comparisonInstructionsChanged: booleanValue(comparison.instructionsChanged),
    comparisonToolsChanged: booleanValue(comparison.toolsChanged),
    publicSafe: true,
  };
}

function emptyCache(): RuntimeModelCallCache {
  return {
    promptCacheKey: undefined,
    totalEstimatedTokens: undefined,
    cacheablePrefixEstimatedTokens: undefined,
    dynamicEstimatedTokens: undefined,
    segmentCount: undefined,
    providerStablePrefixEstimatedTokens: undefined,
    providerDynamicInputEstimatedTokens: undefined,
    stablePrefixShare: undefined,
    dynamicInputShare: undefined,
    stablePrefixHash: undefined,
    dynamicPayloadHash: undefined,
    instructionsHash: undefined,
    inputHash: undefined,
    previousProviderOutputItems: undefined,
    toolResultInputs: undefined,
    observedUsageDiagnosis: undefined,
    stablePrefixWarmthEstimate: undefined,
    comparisonStablePrefixChanged: undefined,
    comparisonDynamicPayloadChanged: undefined,
    comparisonInstructionsChanged: undefined,
    comparisonToolsChanged: undefined,
    publicSafe: true,
  };
}

function fleetFromMetadata(metadata: Readonly<Record<string, unknown>>): RuntimeModelCallFleet {
  return {
    endpointRef: stringValue(metadata.modelFleetEndpointRef),
    fallbackFrom: stringValue(metadata.fallbackFrom),
    adaptiveSelection: booleanValue(metadata.modelFleetAdaptiveSelection),
    capabilitySelection: booleanValue(metadata.modelFleetCapabilitySelection),
    requiredCapabilities: stringArray(metadata.modelFleetRequiredCapabilities),
    retryAttempt: numberValue(metadata.modelFleetRetryAttempt),
    maxRetries: numberValue(metadata.modelFleetMaxRetries),
    failureCode: stringValue(metadata.modelFailureCode),
    failureRetryable: booleanValue(metadata.modelFailureRetryable),
    publicSafe: true,
  };
}

function providerFromMetadata(metadata: Readonly<Record<string, unknown>>, invocation: RuntimeInvocationRecord | undefined): RuntimeModelCallProvider {
  const previousProviderResponseId = stringValue(metadata.previousProviderResponseId);
  return {
    provider: stringValue(metadata.provider),
    carrierId: stringValue(metadata.carrierId) ?? invocation?.target,
    model: stringValue(metadata.model),
    providerResponseId: stringValue(metadata.providerResponseId),
    previousProviderResponseId,
    reusedPreviousResponse: previousProviderResponseId !== undefined,
    publicSafe: true,
  };
}

function statusFromPhase(phase: string | undefined, fallback: boolean | undefined): RuntimeModelCallStatus {
  if (phase === "started" || phase === "completed" || phase === "failed") return phase;
  if (fallback === true) return "completed";
  if (fallback === false) return "failed";
  return "unknown";
}

function modelEvents(input: readonly RuntimeModelCallApplicationEvent[] | undefined): readonly RuntimeModelCallApplicationEvent[] {
  return (input ?? []).filter((event) => event.kind === "model" && isRecord(event.metadata));
}

function eventModelKey(event: RuntimeModelCallApplicationEvent): string {
  const metadata = isRecord(event.metadata) ? event.metadata : {};
  return `${event.turnId ?? "turn:unknown"}:${stringValue(metadata.invocationId) ?? event.eventId}`;
}

function terminalModelEvents(events: readonly RuntimeModelCallApplicationEvent[]): readonly RuntimeModelCallApplicationEvent[] {
  return events.filter((event) => {
    const phase = stringValue(event.metadata?.modelPhase);
    return phase === "completed" || phase === "failed";
  });
}

function startedOnlyModelEvents(events: readonly RuntimeModelCallApplicationEvent[], terminalKeys: ReadonlySet<string>): readonly RuntimeModelCallApplicationEvent[] {
  return events.filter((event) => stringValue(event.metadata?.modelPhase) === "started" && !terminalKeys.has(eventModelKey(event)));
}

function stepForInvocation(snapshot: RuntimeSessionSnapshot | undefined, invocationId: string | undefined): MainLoopStepRecord | undefined {
  if (snapshot === undefined || invocationId === undefined) return undefined;
  return snapshot.mainLoopSteps.find((step) => step.modelCallId === invocationId || step.outputRefs.includes(invocationId));
}

function invocationForEvent(snapshot: RuntimeSessionSnapshot | undefined, invocationId: string | undefined): RuntimeInvocationRecord | undefined {
  if (snapshot === undefined || invocationId === undefined) return undefined;
  return snapshot.invocations.find((invocation) => invocation.kind === "model" && invocation.invocationId === invocationId);
}

function errorForInvocation(snapshot: RuntimeSessionSnapshot | undefined, invocationId: string | undefined): RuntimePublicSafeErrorRecord | undefined {
  if (snapshot === undefined || invocationId === undefined) return undefined;
  return snapshot.errors.find((error) =>
    error.boundary === "model" &&
    (error.errorId.includes(invocationId) || stringValue(error.metadata.invocationId) === invocationId)
  );
}

function callFromEvent(input: {
  event: RuntimeModelCallApplicationEvent;
  snapshot?: RuntimeSessionSnapshot;
}): RuntimeModelCallRecord {
  const metadata = isRecord(input.event.metadata) ? input.event.metadata : {};
  const invocationId = stringValue(metadata.invocationId);
  const invocation = invocationForEvent(input.snapshot, invocationId);
  const step = stepForInvocation(input.snapshot, invocationId);
  const error = errorForInvocation(input.snapshot, invocationId);
  const cache = cacheFromMetadata(metadata);
  const usage = usageFromMetadata(metadata, nested(metadata, "cacheDebug"));
  const provider = providerFromMetadata(metadata, invocation);
  const fleet = fleetFromMetadata({ ...invocation?.summary, ...metadata });
  const status = statusFromPhase(stringValue(metadata.modelPhase), invocation?.ok);
  return {
    callId: input.event.eventId,
    invocationId,
    eventId: input.event.eventId,
    sessionId: input.event.sessionId ?? invocation?.sessionId,
    runtimeId: input.event.runtimeId ?? input.snapshot?.session?.runtimeId,
    turnId: input.event.turnId,
    createdAt: input.event.createdAt,
    ok: status === "completed" ? true : status === "failed" ? false : invocation?.ok,
    status,
    turnIndex: numberValue(metadata.turnIndex) ?? step?.turnIndex,
    stepIndex: step?.stepIndex,
    promptPackId: step?.promptPackRef ?? stringValue(invocation?.summary.promptPackId),
    loweringId: step?.loweredPromptRef ?? stringValue(invocation?.summary.loweringId),
    provider,
    usage,
    cache,
    fleet,
    refs: refs([
      input.event.eventId,
      invocationId,
      invocation?.invocationId,
      step?.stepId,
      step?.promptPackRef,
      step?.loweredPromptRef,
      stringValue(invocation?.summary.promptPackId),
      stringValue(invocation?.summary.loweringId),
      error?.errorId,
    ]),
    metadata: publicSafeMetadata({
      source: "applicationEvent",
      event: {
        status: input.event.status,
        message: input.event.message,
      },
      invocation: invocation === undefined
        ? undefined
        : {
            target: invocation.target,
            ok: invocation.ok,
          },
      step: step === undefined
        ? undefined
        : {
            stepId: step.stepId,
            actionPrimitive: step.actionPrimitive,
            status: step.status,
          },
    }),
    publicSafe: true,
  };
}

function callFromInvocation(input: {
  invocation: RuntimeInvocationRecord;
  snapshot: RuntimeSessionSnapshot;
}): RuntimeModelCallRecord {
  const summary = input.invocation.summary;
  const step = stepForInvocation(input.snapshot, input.invocation.invocationId);
  const error = errorForInvocation(input.snapshot, input.invocation.invocationId);
  const fleet = fleetFromMetadata(summary);
  const status = statusFromPhase(undefined, input.invocation.ok);
  return {
    callId: input.invocation.invocationId,
    invocationId: input.invocation.invocationId,
    eventId: undefined,
    sessionId: input.invocation.sessionId,
    runtimeId: input.snapshot.session?.runtimeId,
    turnId: undefined,
    createdAt: input.invocation.createdAt,
    ok: input.invocation.ok,
    status,
    turnIndex: numberValue(summary.turn) ?? step?.turnIndex,
    stepIndex: step?.stepIndex,
    promptPackId: step?.promptPackRef ?? stringValue(summary.promptPackId),
    loweringId: step?.loweredPromptRef ?? stringValue(summary.loweringId),
    provider: providerFromMetadata(summary, input.invocation),
    usage: emptyUsage(),
    cache: emptyCache(),
    fleet,
    refs: refs([
      input.invocation.invocationId,
      input.invocation.target,
      step?.stepId,
      step?.promptPackRef,
      step?.loweredPromptRef,
      stringValue(summary.promptPackId),
      stringValue(summary.loweringId),
      error?.errorId,
    ]),
    metadata: publicSafeMetadata({
      source: "runtimeInvocation",
      invocation: {
        target: input.invocation.target,
        ok: input.invocation.ok,
      },
      step: step === undefined
        ? undefined
        : {
            stepId: step.stepId,
            actionPrimitive: step.actionPrimitive,
            status: step.status,
          },
    }),
    publicSafe: true,
  };
}

function orderModelCalls(records: readonly RuntimeModelCallRecord[]): readonly RuntimeModelCallRecord[] {
  return [...records].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) ||
    (left.turnId ?? "").localeCompare(right.turnId ?? "") ||
    (left.turnIndex ?? -1) - (right.turnIndex ?? -1) ||
    (left.stepIndex ?? -1) - (right.stepIndex ?? -1) ||
    left.callId.localeCompare(right.callId)
  );
}

function modelCallRecords(input: CreateRuntimeModelCallReportInput): readonly RuntimeModelCallRecord[] {
  const events = modelEvents(input.applicationEvents);
  const terminal = terminalModelEvents(events);
  const terminalKeys = new Set(terminal.map(eventModelKey));
  const eventCalls = [
    ...terminal,
    ...startedOnlyModelEvents(events, terminalKeys),
  ].map((event) => callFromEvent({ event, snapshot: input.snapshot }));
  const eventInvocationIds = new Set(eventCalls.map((call) => call.invocationId).filter((value): value is string => value !== undefined));
  const snapshotCalls = (input.snapshot?.invocations ?? [])
    .filter((invocation) => invocation.kind === "model" && !eventInvocationIds.has(invocation.invocationId))
    .map((invocation) => callFromInvocation({ invocation, snapshot: input.snapshot as RuntimeSessionSnapshot }));
  return orderModelCalls([...eventCalls, ...snapshotCalls]);
}

function addDefined(target: { value: number }, next: number | undefined): void {
  if (next !== undefined) target.value += next;
}

function usageTotals(calls: readonly RuntimeModelCallRecord[]): RuntimeModelCallReport["usageTotals"] {
  const inputTokens = { value: 0 };
  const cachedInputTokens = { value: 0 };
  const nonCachedInputTokens = { value: 0 };
  const outputTokens = { value: 0 };
  const thinkingTokens = { value: 0 };
  const totalTokens = { value: 0 };
  for (const call of calls) {
    addDefined(inputTokens, call.usage.inputTokens);
    addDefined(cachedInputTokens, call.usage.cachedInputTokens);
    addDefined(nonCachedInputTokens, call.usage.nonCachedInputTokens);
    addDefined(outputTokens, call.usage.outputTokens);
    addDefined(thinkingTokens, call.usage.thinkingTokens);
    addDefined(totalTokens, call.usage.totalTokens);
  }
  return {
    inputTokens: inputTokens.value,
    cachedInputTokens: cachedInputTokens.value,
    nonCachedInputTokens: nonCachedInputTokens.value,
    outputTokens: outputTokens.value,
    thinkingTokens: thinkingTokens.value,
    totalTokens: totalTokens.value,
    weightedCacheHitRate: inputTokens.value > 0 ? cachedInputTokens.value / inputTokens.value : undefined,
  };
}

function hasUsage(call: RuntimeModelCallRecord): boolean {
  return call.usage.inputTokens !== undefined ||
    call.usage.outputTokens !== undefined ||
    call.usage.totalTokens !== undefined ||
    call.usage.cachedInputTokens !== undefined;
}

function hasCacheDebug(call: RuntimeModelCallRecord): boolean {
  return call.cache.promptCacheKey !== undefined ||
    call.cache.stablePrefixHash !== undefined ||
    call.cache.dynamicPayloadHash !== undefined ||
    call.cache.observedUsageDiagnosis !== undefined;
}

function hasFleet(call: RuntimeModelCallRecord): boolean {
  return call.fleet.endpointRef !== undefined ||
    call.fleet.fallbackFrom !== undefined ||
    call.fleet.requiredCapabilities.length > 0 ||
    call.fleet.retryAttempt !== undefined ||
    call.fleet.failureCode !== undefined;
}

export function createRuntimeModelCallReport(input: CreateRuntimeModelCallReportInput): RuntimeModelCallReport {
  const calls = modelCallRecords(input);
  const errors = (input.snapshot?.errors ?? []).filter((error) => error.boundary === "model");
  const applicationModelEvents = modelEvents(input.applicationEvents);
  const totals = usageTotals(calls);
  return {
    kind: "praxis.runtime.modelCall.report",
    publicSafe: true,
    sourceKind: input.sourceKind ?? (applicationModelEvents.length > 0 ? "application-events" : "snapshot"),
    session: {
      sessionId: input.snapshot?.session?.sessionId ?? calls.find((call) => call.sessionId !== undefined)?.sessionId,
      runtimeId: input.snapshot?.session?.runtimeId ?? calls.find((call) => call.runtimeId !== undefined)?.runtimeId,
      status: input.snapshot?.session?.status,
    },
    counts: {
      modelCalls: calls.length,
      completed: calls.filter((call) => call.status === "completed").length,
      failed: calls.filter((call) => call.status === "failed").length,
      started: calls.filter((call) => call.status === "started").length,
      withUsage: calls.filter(hasUsage).length,
      withCacheDebug: calls.filter(hasCacheDebug).length,
      cacheTelemetryModelCalls: calls.filter((call) => call.usage.inputTokens !== undefined && call.usage.cachedInputTokens !== undefined).length,
      withProviderResponseId: calls.filter((call) => call.provider.providerResponseId !== undefined).length,
      fallbackCalls: calls.filter((call) => call.fleet.fallbackFrom !== undefined).length,
      retryAttempts: calls.filter((call) => (call.fleet.retryAttempt ?? 0) > 0).length,
      retryableFailures: calls.filter((call) => call.status === "failed" && call.fleet.failureRetryable === true).length,
      nonRetryableFailures: calls.filter((call) => call.status === "failed" && call.fleet.failureRetryable === false).length,
      errors: errors.length,
    },
    usageTotals: totals,
    coverage: {
      hasSession: input.snapshot?.session !== undefined || calls.some((call) => call.sessionId !== undefined),
      hasRuntimeModelInvocations: (input.snapshot?.invocations ?? []).some((invocation) => invocation.kind === "model"),
      hasApplicationModelEvents: applicationModelEvents.length > 0,
      hasUsage: calls.some(hasUsage),
      hasCacheDebug: calls.some(hasCacheDebug),
      hasCacheTelemetry: calls.some((call) => call.usage.inputTokens !== undefined && call.usage.cachedInputTokens !== undefined),
      hasProviderResponseIds: calls.some((call) => call.provider.providerResponseId !== undefined),
      hasModelFleetEvidence: calls.some(hasFleet),
      hasFallbackEvidence: calls.some((call) => call.fleet.fallbackFrom !== undefined),
      hasRetryEvidence: calls.some((call) => (call.fleet.retryAttempt ?? 0) > 0),
      hasFailures: calls.some((call) => call.status === "failed") || errors.length > 0,
    },
    providers: uniqueSorted(calls.map((call) => call.provider.provider)),
    carrierIds: uniqueSorted(calls.map((call) => call.provider.carrierId)),
    models: uniqueSorted(calls.map((call) => call.provider.model)),
    endpointRefs: uniqueSorted(calls.map((call) => call.fleet.endpointRef)),
    failureCodes: uniqueSorted([
      ...calls.map((call) => call.fleet.failureCode),
      ...errors.map((error) => error.code),
    ]),
    cacheDiagnoses: uniqueSorted(calls.map((call) => call.cache.observedUsageDiagnosis)),
    promptCacheKeys: uniqueSorted(calls.map((call) => call.cache.promptCacheKey)),
    modelCalls: calls,
  };
}

export function createRuntimeModelCallIndex(report: RuntimeModelCallReport): RuntimeModelCallIndex {
  const byStatus = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const byCarrierId = new Map<string, number>();
  const byEndpointRef = new Map<string, number>();
  const byFailureCode = new Map<string, number>();
  const byCacheDiagnosis = new Map<string, number>();
  for (const call of report.modelCalls) {
    increment(byStatus, call.status);
    increment(byProvider, call.provider.provider);
    increment(byCarrierId, call.provider.carrierId);
    increment(byEndpointRef, call.fleet.endpointRef);
    increment(byFailureCode, call.fleet.failureCode);
    increment(byCacheDiagnosis, call.cache.observedUsageDiagnosis);
  }
  return {
    kind: "praxis.runtime.modelCall.index",
    publicSafe: true,
    sourceKind: report.sourceKind,
    totalModelCalls: report.modelCalls.length,
    byStatus: sortedRecord(byStatus),
    byProvider: sortedRecord(byProvider),
    byCarrierId: sortedRecord(byCarrierId),
    byEndpointRef: sortedRecord(byEndpointRef),
    byFailureCode: sortedRecord(byFailureCode),
    byCacheDiagnosis: sortedRecord(byCacheDiagnosis),
    promptCacheKeys: report.promptCacheKeys,
  };
}

function matchesQuery(call: RuntimeModelCallRecord, query: RuntimeModelCallQuery): boolean {
  if (query.status !== undefined && call.status !== query.status) return false;
  if (query.provider !== undefined && call.provider.provider !== query.provider) return false;
  if (query.carrierId !== undefined && call.provider.carrierId !== query.carrierId) return false;
  if (query.model !== undefined && call.provider.model !== query.model) return false;
  if (query.endpointRef !== undefined && call.fleet.endpointRef !== query.endpointRef) return false;
  if (query.fallbackFrom !== undefined && call.fleet.fallbackFrom !== query.fallbackFrom) return false;
  if (query.failureCode !== undefined && call.fleet.failureCode !== query.failureCode) return false;
  if (query.cacheDiagnosis !== undefined && call.cache.observedUsageDiagnosis !== query.cacheDiagnosis) return false;
  if (query.hasCacheDebug !== undefined && hasCacheDebug(call) !== query.hasCacheDebug) return false;
  if (query.ref !== undefined && !call.refs.includes(query.ref)) return false;
  if (query.createdAtFrom !== undefined && call.createdAt.localeCompare(query.createdAtFrom) < 0) return false;
  if (query.createdAtTo !== undefined && call.createdAt.localeCompare(query.createdAtTo) > 0) return false;
  return true;
}

export function queryRuntimeModelCalls(input: QueryRuntimeModelCallsInput): RuntimeModelCallQueryResult {
  const query = input.query ?? {};
  const matched = input.report.modelCalls.filter((call) => matchesQuery(call, query));
  const limit = numberLimit(query.limit);
  const modelCalls = limit === undefined ? matched : matched.slice(0, limit);
  return {
    kind: "praxis.runtime.modelCall.queryResult",
    publicSafe: true,
    sourceKind: input.report.sourceKind,
    query,
    totalModelCalls: input.report.modelCalls.length,
    matchedModelCalls: matched.length,
    returnedModelCalls: modelCalls.length,
    modelCalls,
  };
}
