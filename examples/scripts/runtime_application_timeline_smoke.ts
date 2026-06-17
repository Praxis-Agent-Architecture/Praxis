import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import {
  createApplicationRestServer,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationTimelineReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

import {
  runApplicationKernelShellSmoke,
} from "./runtime_application_kernel_shell_smoke.js";
import {
  runApplicationProviderHealthSmoke,
} from "./runtime_application_provider_health_smoke.js";

export type RuntimeApplicationTimelineSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  timeline: {
    retainedEventCount: number;
    localViewEventCount: number;
    restViewEventCount: number;
    sameEventIdsInLocalAndRest: boolean;
    ordered: boolean;
    includesSubmitted: boolean;
    includesManifestReady: boolean;
    includesModelProgress: boolean;
    includesToolCompleted: boolean;
    includesFinal: boolean;
    applicationReport: {
      applicationCommandKind: string | undefined;
      reportStatus: "ok" | "failed";
      sourceKind: string | undefined;
      timelineItems: number;
      indexTotalItems: number;
      queryReturnedItems: number;
      eventItems: number;
      invocationItems: number;
      mainLoopStepItems: number;
      hasRuntimeEvents: boolean;
      hasInvocations: boolean;
      hasMainLoopSteps: boolean;
      replayStatus: string | undefined;
      replayMode: string | undefined;
      replayRequiresExecution: string | undefined;
      publicSafe: boolean;
    };
    modelFleetMetadata: {
      localModelEventCount: number;
      restModelEventCount: number;
      streamModelEventCount: number;
      webSocketModelEventCount: number;
      sameModelEventIdsInLocalRestStreamAndWebSocket: boolean;
      retryableFailurePreservedEverywhere: boolean;
      fallbackPreservedEverywhere: boolean;
      failureCodes: readonly string[];
      endpointRefs: readonly string[];
      fallbackFromRefs: readonly string[];
    };
    finalEvent: {
      eventId: string | undefined;
      kind: PraxisApplicationEvent["kind"] | undefined;
      status: PraxisApplicationEvent["status"] | undefined;
      turnId: string | undefined;
      publicSafe: boolean | undefined;
    };
    toolEvent: {
      eventId: string | undefined;
      toolId: string | undefined;
      toolStatus: string | undefined;
      turnId: string | undefined;
      publicSafe: boolean | undefined;
    };
  };
  stream: {
    sawInitialView: boolean;
    sawSubmitted: boolean;
    sawToolCompleted: boolean;
    sawFinal: boolean;
    eventCount: number;
  };
};

export type RuntimeApplicationTimelineSmokeInput = {
  now?: () => string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseSseFrames(buffer: string): {
  frames: { event?: string; data?: unknown }[];
  rest: string;
} {
  const normalized = buffer.replace(/\r\n/gu, "\n");
  const chunks = normalized.split("\n\n");
  const rest = chunks.pop() ?? "";
  const frames: { event?: string; data?: unknown }[] = [];
  for (const chunk of chunks) {
    let eventName: string | undefined;
    const dataLines: string[] = [];
    for (const line of chunk.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length === 0) continue;
    frames.push({
      event: eventName,
      data: JSON.parse(dataLines.join("\n")) as unknown,
    });
  }
  return { frames, rest };
}

async function collectApplicationEventStream<T>(input: {
  url: string;
  action: () => Promise<T>;
  timeoutMs?: number;
}): Promise<{
  sawInitialView: boolean;
  events: PraxisApplicationEvent[];
  result: T;
}> {
  const controller = new AbortController();
  const events: PraxisApplicationEvent[] = [];
  let sawInitialView = false;
  let buffer = "";
  const response = await fetch(`${input.url}/application/events`, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!response.ok || response.body === null) {
    throw new Error(`application event stream failed: ${response.status} ${response.statusText}`);
  }

  let resolveReader: (() => void) | undefined;
  let rejectReader: ((error: unknown) => void) | undefined;
  const readerDone = new Promise<void>((resolve, reject) => {
    resolveReader = resolve;
    rejectReader = reject;
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs ?? 5_000);

  void (async () => {
    try {
      while (!controller.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          if (frame.event === "application.view") {
            sawInitialView = true;
            continue;
          }
          if (frame.event !== "application.event") continue;
          const event = frame.data as PraxisApplicationEvent;
          events.push(event);
          if (event.kind === "final") controller.abort();
        }
      }
      resolveReader?.();
    } catch (error) {
      if (!controller.signal.aborted) rejectReader?.(error);
      else resolveReader?.();
    }
  })();

  const result = await input.action();
  await readerDone;
  clearTimeout(timeout);
  controller.abort();
  return { sawInitialView, events, result };
}

async function readRestView(url: string): Promise<PraxisApplicationViewModel> {
  const response = await fetch(`${url}/application/view`);
  if (!response.ok) {
    throw new Error(`application view request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json() as PraxisApplicationViewModel;
}

function eventMetadata(event: PraxisApplicationEvent | undefined): Readonly<Record<string, unknown>> {
  return record(event?.metadata);
}

function eventIds(events: readonly PraxisApplicationEvent[]): readonly string[] {
  return events.map((event) => event.eventId);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function timelineReportOutput(value: unknown): PraxisApplicationTimelineReportOutput {
  if (record(value).kind !== "praxis.application.timelineReport") {
    throw new Error("application inspectTimeline did not return a timeline report output.");
  }
  return value as PraxisApplicationTimelineReportOutput;
}

function uniqueSortedStrings(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))].sort();
}

function modelFleetEvents(events: readonly PraxisApplicationEvent[]): readonly PraxisApplicationEvent[] {
  return events.filter((event) =>
    event.kind === "model" &&
    eventMetadata(event).modelPhase !== "started" &&
    stringValue(eventMetadata(event).modelFleetEndpointRef) !== undefined
  );
}

function hasRetryableFailure(events: readonly PraxisApplicationEvent[]): boolean {
  return modelFleetEvents(events).some((event) => {
    const metadata = eventMetadata(event);
    return metadata.modelPhase === "failed" &&
      metadata.modelFailureRetryable === true &&
      stringValue(metadata.modelFailureCode) !== undefined &&
      stringValue(metadata.modelFleetEndpointRef) !== undefined;
  });
}

function hasFallbackSelection(events: readonly PraxisApplicationEvent[]): boolean {
  return modelFleetEvents(events).some((event) => {
    const metadata = eventMetadata(event);
    return metadata.modelPhase === "completed" &&
      stringValue(metadata.fallbackFrom) !== undefined &&
      stringValue(metadata.modelFleetEndpointRef) !== undefined;
  });
}

function modelFleetMetadataSummary(input: {
  localEvents: readonly PraxisApplicationEvent[];
  restEvents: readonly PraxisApplicationEvent[];
  streamEvents: readonly PraxisApplicationEvent[];
  webSocketEvents: readonly PraxisApplicationEvent[];
}): RuntimeApplicationTimelineSmokeResult["timeline"]["modelFleetMetadata"] {
  const localModelEvents = modelFleetEvents(input.localEvents);
  const restModelEvents = modelFleetEvents(input.restEvents);
  const streamModelEvents = modelFleetEvents(input.streamEvents);
  const webSocketModelEvents = modelFleetEvents(input.webSocketEvents);
  const localIds = eventIds(localModelEvents);
  const restIds = eventIds(restModelEvents);
  const streamIds = eventIds(streamModelEvents);
  const webSocketIds = eventIds(webSocketModelEvents);
  return {
    localModelEventCount: localModelEvents.length,
    restModelEventCount: restModelEvents.length,
    streamModelEventCount: streamModelEvents.length,
    webSocketModelEventCount: webSocketModelEvents.length,
    sameModelEventIdsInLocalRestStreamAndWebSocket: sameStringList(localIds, restIds) &&
      sameStringList(localIds, streamIds) &&
      sameStringList(localIds, webSocketIds),
    retryableFailurePreservedEverywhere: hasRetryableFailure(input.localEvents) &&
      hasRetryableFailure(input.restEvents) &&
      hasRetryableFailure(input.streamEvents) &&
      hasRetryableFailure(input.webSocketEvents),
    fallbackPreservedEverywhere: hasFallbackSelection(input.localEvents) &&
      hasFallbackSelection(input.restEvents) &&
      hasFallbackSelection(input.streamEvents) &&
      hasFallbackSelection(input.webSocketEvents),
    failureCodes: uniqueSortedStrings(localModelEvents.map((event) => stringValue(eventMetadata(event).modelFailureCode))),
    endpointRefs: uniqueSortedStrings(localModelEvents.map((event) => stringValue(eventMetadata(event).modelFleetEndpointRef))),
    fallbackFromRefs: uniqueSortedStrings(localModelEvents.map((event) => stringValue(eventMetadata(event).fallbackFrom))),
  };
}

export async function runApplicationTimelineSmoke(
  input: RuntimeApplicationTimelineSmokeInput = {},
): Promise<RuntimeApplicationTimelineSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-timeline-smoke-"));
  try {
    let restUrl: string | undefined;
    const kernelResult = await runApplicationKernelShellSmoke({
      now,
      projectRoot,
      finalOutputText: "application timeline smoke completed",
      beforeSubmitTurn: async ({ runtime, submitTurn }) => {
        const rest = await createApplicationRestServer(runtime);
        const transport = createLocalApplicationTransport(runtime);
        restUrl = rest.url;
        try {
          const stream = await collectApplicationEventStream({
            url: rest.url,
            action: submitTurn,
          });
          const restView = await readRestView(rest.url);
          const timelineReportResult = await transport.dispatch({
            type: "application.inspectTimeline",
            query: { itemKinds: ["event", "invocation", "mainLoopStep"] },
          });
          if (!timelineReportResult.ok) {
            throw new Error(timelineReportResult.error.message);
          }
          return { result: stream.result, output: { stream, restView, timelineReport: timelineReportResult.output } };
        } finally {
          await rest.close();
        }
      },
    });

    const output = record(kernelResult.output);
    const stream = record(output.stream);
    const streamEvents = Array.isArray(stream.events) ? stream.events as PraxisApplicationEvent[] : [];
    const sawInitialView = booleanValue(stream.sawInitialView) ?? false;
    const restView = record(output.restView) as unknown as PraxisApplicationViewModel | undefined;
    const applicationTimelineReport = timelineReportOutput(output.timelineReport);
    const timelineReport = applicationTimelineReport.report;
    const localEvents = kernelResult.retainedEvents;
    const restEvents = restView?.events ?? [];
    const finalEvent = localEvents.find((event) => event.kind === "final");
    const toolEvent = localEvents.find((event) => {
      const metadata = eventMetadata(event);
      return event.kind === "tool" && metadata.toolId === "shell.run" && metadata.toolStatus === "completed";
    });
    const localIds = eventIds(localEvents);
    const restIds = eventIds(restEvents);
    const streamIds = eventIds(streamEvents);
    const providerTimelineResult = await runApplicationProviderHealthSmoke({
      now,
      includeApplicationArtifacts: true,
      includeTimelineArtifacts: true,
    });
    const providerTimelineArtifacts = providerTimelineResult.applicationArtifacts?.retryThenFallback;
    const modelFleetMetadata = modelFleetMetadataSummary({
      localEvents: providerTimelineArtifacts?.events ?? [],
      restEvents: providerTimelineArtifacts?.restView?.events ?? [],
      streamEvents: providerTimelineArtifacts?.streamEvents ?? [],
      webSocketEvents: providerTimelineArtifacts?.webSocketEvents ?? [],
    });
    const timeline = {
      retainedEventCount: localEvents.length,
      localViewEventCount: kernelResult.view.counters.events,
      restViewEventCount: restEvents.length,
      sameEventIdsInLocalAndRest: sameStringList(localIds, restIds),
      ordered: localIds.indexOf("turn.1.submitted") > -1 &&
        localIds.indexOf("turn.1.manifest.ready") > localIds.indexOf("turn.1.submitted") &&
        localIds.indexOf(finalEvent?.eventId ?? "") === localIds.length - 1,
      includesSubmitted: localIds.includes("turn.1.submitted"),
      includesManifestReady: localIds.includes("turn.1.manifest.ready"),
      includesModelProgress: localEvents.some((event) => event.kind === "model"),
      includesToolCompleted: toolEvent !== undefined,
      includesFinal: finalEvent !== undefined,
      applicationReport: {
        applicationCommandKind: applicationTimelineReport.kind,
        reportStatus: timelineReport.kind === "praxis.runtime.timeline.report" ? "ok" as const : "failed" as const,
        sourceKind: timelineReport.sourceKind,
        timelineItems: timelineReport.counts.timelineItems,
        indexTotalItems: applicationTimelineReport.index.totalItems,
        queryReturnedItems: applicationTimelineReport.query.returnedItems,
        eventItems: applicationTimelineReport.index.byItemKind.event ?? 0,
        invocationItems: applicationTimelineReport.index.byItemKind.invocation ?? 0,
        mainLoopStepItems: applicationTimelineReport.index.byItemKind.mainLoopStep ?? 0,
        hasRuntimeEvents: timelineReport.coverage.hasRuntimeEvents,
        hasInvocations: timelineReport.coverage.hasInvocations,
        hasMainLoopSteps: timelineReport.coverage.hasMainLoopSteps,
        replayStatus: applicationTimelineReport.replayPlan.status,
        replayMode: applicationTimelineReport.replayPlan.mode,
        replayRequiresExecution: applicationTimelineReport.replayPlan.requiredPolicy.execution,
        publicSafe: applicationTimelineReport.publicSafe &&
          timelineReport.publicSafe &&
          applicationTimelineReport.index.publicSafe &&
          applicationTimelineReport.query.publicSafe &&
          applicationTimelineReport.replayPlan.publicSafe,
      },
      modelFleetMetadata,
      finalEvent: {
        eventId: finalEvent?.eventId,
        kind: finalEvent?.kind,
        status: finalEvent?.status,
        turnId: finalEvent?.turnId,
        publicSafe: finalEvent?.publicSafe,
      },
      toolEvent: {
        eventId: toolEvent?.eventId,
        toolId: stringValue(eventMetadata(toolEvent).toolId),
        toolStatus: stringValue(eventMetadata(toolEvent).toolStatus),
        turnId: toolEvent?.turnId,
        publicSafe: toolEvent?.publicSafe,
      },
    };
    const streamSummary = {
      sawInitialView,
      sawSubmitted: streamIds.includes("turn.1.submitted"),
      sawToolCompleted: streamEvents.some((event) => {
        const metadata = eventMetadata(event);
        return event.kind === "tool" && metadata.toolId === "shell.run" && metadata.toolStatus === "completed";
      }),
      sawFinal: streamEvents.some((event) => event.kind === "final"),
      eventCount: streamEvents.length,
    };
    const view = {
      status: kernelResult.view.status,
      finalOutput: kernelResult.view.finalOutput,
      counters: kernelResult.view.counters,
    };
    return {
      status: kernelResult.status === "ok" &&
        restUrl !== undefined &&
        view.status === "completed" &&
        view.finalOutput === "application timeline smoke completed" &&
        view.counters.turns === 1 &&
        view.counters.modelCalls === 2 &&
        view.counters.toolCalls === 1 &&
        timeline.retainedEventCount === timeline.localViewEventCount &&
        timeline.retainedEventCount === timeline.restViewEventCount &&
        timeline.sameEventIdsInLocalAndRest &&
        timeline.ordered &&
        timeline.includesSubmitted &&
        timeline.includesManifestReady &&
        timeline.includesModelProgress &&
        timeline.includesToolCompleted &&
        timeline.includesFinal &&
        timeline.applicationReport.applicationCommandKind === "praxis.application.timelineReport" &&
        timeline.applicationReport.reportStatus === "ok" &&
        timeline.applicationReport.sourceKind === "application-memory" &&
        timeline.applicationReport.timelineItems === timeline.applicationReport.indexTotalItems &&
        timeline.applicationReport.queryReturnedItems >= 3 &&
        timeline.applicationReport.eventItems >= 2 &&
        timeline.applicationReport.invocationItems >= 1 &&
        timeline.applicationReport.mainLoopStepItems >= 1 &&
        timeline.applicationReport.hasRuntimeEvents &&
        timeline.applicationReport.hasInvocations &&
        timeline.applicationReport.hasMainLoopSteps &&
        timeline.applicationReport.replayStatus === "unavailable" &&
        timeline.applicationReport.replayMode === "read-only-plan" &&
        timeline.applicationReport.replayRequiresExecution === "none" &&
        timeline.applicationReport.publicSafe &&
        providerTimelineResult.status === "ok" &&
        providerTimelineArtifacts?.sawInitialView === true &&
        providerTimelineArtifacts.sawWebSocketReady === true &&
        timeline.modelFleetMetadata.localModelEventCount === 3 &&
        timeline.modelFleetMetadata.restModelEventCount === 3 &&
        timeline.modelFleetMetadata.streamModelEventCount === 3 &&
        timeline.modelFleetMetadata.webSocketModelEventCount === 3 &&
        timeline.modelFleetMetadata.sameModelEventIdsInLocalRestStreamAndWebSocket &&
        timeline.modelFleetMetadata.retryableFailurePreservedEverywhere &&
        timeline.modelFleetMetadata.fallbackPreservedEverywhere &&
        sameStringList(timeline.modelFleetMetadata.failureCodes, ["PROVIDER_RATE_LIMITED"]) &&
        sameStringList(timeline.modelFleetMetadata.endpointRefs, ["fallback", "primary"]) &&
        sameStringList(timeline.modelFleetMetadata.fallbackFromRefs, ["primary"]) &&
        timeline.finalEvent.publicSafe === true &&
        timeline.finalEvent.kind === "final" &&
        timeline.finalEvent.status === "completed" &&
        timeline.finalEvent.turnId === "turn.1" &&
        timeline.toolEvent.toolId === "shell.run" &&
        timeline.toolEvent.toolStatus === "completed" &&
        streamSummary.sawInitialView &&
        streamSummary.sawSubmitted &&
        streamSummary.sawToolCompleted &&
        streamSummary.sawFinal
        ? "ok"
        : "failed",
      startedAt,
      finishedAt: now(),
      projectRoot,
      view,
      timeline,
      stream: streamSummary,
    };
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationTimelineSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
