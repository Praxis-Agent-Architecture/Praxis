import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationModelCallReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationPromptPackCacheSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
    usage: PraxisApplicationViewModel["usage"];
    context: PraxisApplicationViewModel["context"];
  };
  providerCalls: number;
  providerBodies: {
    firstPromptCacheKey: string | undefined;
    secondPromptCacheKey: string | undefined;
    firstHasPreviousResponseId: boolean;
    secondHasPreviousResponseId: boolean;
    firstInputHash: string | undefined;
    secondInputHash: string | undefined;
    firstInstructionsHash: string | undefined;
    secondInstructionsHash: string | undefined;
  };
  cacheEvents: readonly {
    eventId: string;
    hasCacheDebug: boolean;
    promptCacheKey: string | undefined;
    stablePrefixHash: string | undefined;
    dynamicPayloadHash: string | undefined;
    instructionsHash: string | undefined;
    inputHash: string | undefined;
    comparisonStablePrefixChanged: boolean | undefined;
    comparisonDynamicPayloadChanged: boolean | undefined;
    observedUsageDiagnosis: string | undefined;
  }[];
  cacheInvariant: {
    stablePrefixHashUnchanged: boolean;
    dynamicPayloadHashChanged: boolean;
    instructionsHashUnchanged: boolean;
    inputHashChanged: boolean;
    promptCacheKeyStable: boolean;
    secondComparisonAvailable: boolean;
  };
  modelCallReport: {
    applicationCommandKind: PraxisApplicationModelCallReportOutput["kind"];
    applicationQueryModelCalls: number;
    reportStatus: "ok" | "failed";
    modelCalls: number;
    completed: number;
    withUsage: number;
    withCacheDebug: number;
    cacheTelemetryModelCalls: number;
    promptCacheKeys: readonly string[];
    weightedCacheHitRate: number | undefined;
    openaiModelCalls: number;
    cacheDebugModelCalls: number;
    primaryEndpointCalls: number;
    stablePrefixUnchanged: boolean | undefined;
    dynamicPayloadChanged: boolean | undefined;
    publicSafe: boolean;
  };
  promptPack: {
    totalEstimatedTokens: number;
    cacheablePrefixEstimatedTokens: number;
    dynamicEstimatedTokens: number;
    segmentKinds: readonly string[];
    cacheablePrefixSegmentKinds: readonly string[];
    dynamicSegmentKinds: readonly string[];
  };
  events: readonly string[];
  applicationArtifacts?: {
    events: readonly PraxisApplicationEvent[];
    view: PraxisApplicationViewModel;
  };
};

export type RuntimeApplicationPromptPackCacheSmokeInput = {
  now?: () => string;
  includeApplicationArtifacts?: boolean;
};

type ApplicationCacheDebugRecord = {
  kind: "praxis.modelCall.cacheDebug";
  promptCacheKey?: string;
  promptPack: {
    totalEstimatedTokens: number;
    cacheablePrefixEstimatedTokens: number;
    dynamicEstimatedTokens: number;
    segments: readonly {
      segmentKind: string;
      cachePolicy: string;
    }[];
  };
  providerBody: {
    fingerprints: Readonly<Record<string, string>>;
    cacheShape: {
      stablePrefixHash: string;
      dynamicPayloadHash: string;
    };
  };
  comparisonToPrevious?: {
    stablePrefixChanged?: boolean;
    dynamicPayloadChanged?: boolean;
  };
  observedUsage?: {
    diagnosis?: string;
  };
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function modelCallReportOutput(value: unknown): PraxisApplicationModelCallReportOutput {
  if (record(value).kind !== "praxis.application.modelCallReport") {
    throw new Error("application inspectModelCalls did not return a model-call report output.");
  }
  return value as PraxisApplicationModelCallReportOutput;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function cacheDebugFromEvent(event: PraxisApplicationEvent): ApplicationCacheDebugRecord | undefined {
  const candidate = record(event.metadata).cacheDebug;
  const debug = record(candidate);
  return debug.kind === "praxis.modelCall.cacheDebug"
    ? candidate as ApplicationCacheDebugRecord
    : undefined;
}

function modelCompletedCacheEvents(events: readonly PraxisApplicationEvent[]): RuntimeApplicationPromptPackCacheSmokeResult["cacheEvents"] {
  return events
    .filter((event) =>
      event.kind === "model" &&
      record(event.metadata).modelPhase === "completed"
    )
    .map((event) => {
      const cacheDebug = cacheDebugFromEvent(event);
      const comparison = cacheDebug?.comparisonToPrevious;
      const observed = cacheDebug?.observedUsage;
      return {
        eventId: event.eventId,
        hasCacheDebug: cacheDebug !== undefined,
        promptCacheKey: cacheDebug?.promptCacheKey,
        stablePrefixHash: cacheDebug?.providerBody.cacheShape.stablePrefixHash,
        dynamicPayloadHash: cacheDebug?.providerBody.cacheShape.dynamicPayloadHash,
        instructionsHash: cacheDebug?.providerBody.fingerprints.instructionsHash,
        inputHash: cacheDebug?.providerBody.fingerprints.inputHash,
        comparisonStablePrefixChanged: comparison?.stablePrefixChanged,
        comparisonDynamicPayloadChanged: comparison?.dynamicPayloadChanged,
        observedUsageDiagnosis: observed?.diagnosis,
      };
    });
}

function promptPackSummary(cacheDebug: ApplicationCacheDebugRecord | undefined): RuntimeApplicationPromptPackCacheSmokeResult["promptPack"] {
  const segments = cacheDebug?.promptPack.segments ?? [];
  return {
    totalEstimatedTokens: cacheDebug?.promptPack.totalEstimatedTokens ?? 0,
    cacheablePrefixEstimatedTokens: cacheDebug?.promptPack.cacheablePrefixEstimatedTokens ?? 0,
    dynamicEstimatedTokens: cacheDebug?.promptPack.dynamicEstimatedTokens ?? 0,
    segmentKinds: segments.map((segment) => segment.segmentKind),
    cacheablePrefixSegmentKinds: segments
      .filter((segment) => segment.cachePolicy !== "dynamic-no-cache")
      .map((segment) => segment.segmentKind),
    dynamicSegmentKinds: segments
      .filter((segment) => segment.cachePolicy === "dynamic-no-cache")
      .map((segment) => segment.segmentKind),
  };
}

function providerBodySummary(
  providerBodies: readonly unknown[],
  cacheEvents: RuntimeApplicationPromptPackCacheSmokeResult["cacheEvents"],
): RuntimeApplicationPromptPackCacheSmokeResult["providerBodies"] {
  const firstBody = record(providerBodies[0]);
  const secondBody = record(providerBodies[1]);
  return {
    firstPromptCacheKey: stringValue(firstBody.prompt_cache_key),
    secondPromptCacheKey: stringValue(secondBody.prompt_cache_key),
    firstHasPreviousResponseId: stringValue(firstBody.previous_response_id) !== undefined,
    secondHasPreviousResponseId: stringValue(secondBody.previous_response_id) !== undefined,
    firstInputHash: cacheEvents[0]?.inputHash,
    secondInputHash: cacheEvents[1]?.inputHash,
    firstInstructionsHash: cacheEvents[0]?.instructionsHash,
    secondInstructionsHash: cacheEvents[1]?.instructionsHash,
  };
}

function eventSummary(event: PraxisApplicationEvent): string {
  const metadata = record(event.metadata);
  if (event.kind !== "model") return event.kind;
  return `model:${String(metadata.modelPhase ?? "unknown")}`;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-promptpack-cache-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-promptpack-cache-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application promptPack cache smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-promptpack-cache-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-promptpack-cache-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationPromptPackCacheSmokePrompt extends praxis.PromptPack {
  promptPackId = "prompt.example.applicationPromptPackCacheSmoke";
  base = praxis.prompt.markdown(
    "You are the application promptPack cache smoke agent. Keep these stable instructions identical across turns.",
    "applicationPromptPackCache.base",
  );
  patches = [
    praxis.prompt.append(
      "applicationPromptPackCache.base",
      praxis.prompt.markdown(
        "Stable cache rule: runtime policy and tool declarations belong to the cacheable prefix.",
        "applicationPromptPackCache.cacheRule",
      ),
    ),
  ];
  materials = [
    "applicationPromptPackCache.base",
    "applicationPromptPackCache.cacheRule",
    "promptPackage:application-promptpack-cache-smoke",
  ];
  designOwner = "archetype";
  metadata = {
    purpose: "application-facing promptPack cache smoke",
    providerPayloadBuiltHere: false,
  };
}

export class ApplicationPromptPackCacheSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationPromptPackCacheSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationPromptPackCacheSmoke",
  });
  promptPack = new ApplicationPromptPackCacheSmokePrompt();
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    promptPackRef: "prompt.example.applicationPromptPackCacheSmoke",
    policy: praxis.policy({
      allowProviderCall: true,
      scopes: ["agent.invoke", "promptPack.define"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 1,
      maxToolCalls: 0,
    }),
  });
}

export default ApplicationPromptPackCacheSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-promptpack-cache-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationPromptPackCacheSmokeAgent",
    application: { id: "application.promptpack-cache-smoke" },
    agent: { id: "agent.example.applicationPromptPackCacheSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

export async function runApplicationPromptPackCacheSmoke(
  input: RuntimeApplicationPromptPackCacheSmokeInput = {},
): Promise<RuntimeApplicationPromptPackCacheSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-promptpack-cache-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "codingCore",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          return {
            id: `resp-application-promptpack-cache-${providerCalls}`,
            output_text: providerCalls === 1
              ? "application promptPack cache first turn completed"
              : "application promptPack cache second turn completed",
            usage: {
              input_tokens: providerCalls === 1 ? 220 : 230,
              output_tokens: 12,
              total_tokens: providerCalls === 1 ? 232 : 242,
              input_tokens_details: { cached_tokens: providerCalls === 1 ? 0 : 160 },
            },
          };
        },
      }),
    });
    if (!created.ok) {
      throw new Error(created.error.message);
    }
    const unsubscribe = created.runtime.subscribe((event) => events.push(event));
    try {
      const transport = createLocalApplicationTransport(created.runtime);
      await transport.dispatch({
        type: "application.start",
        cwd: projectRoot,
        mode: "live",
      });
      const first = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "First application cache turn: inspect stable PromptPack prefix.",
          cwd: projectRoot,
        },
      });
      if (!first.ok) {
        throw new Error(first.error.message);
      }
      const second = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "Second application cache turn: use a different dynamic request while keeping the same declared prompt.",
          cwd: projectRoot,
        },
      });
      if (!second.ok) {
        throw new Error(second.error.message);
      }
      const modelCallReportResult = await transport.dispatch({
        type: "application.inspectModelCalls",
        query: { hasCacheDebug: true },
      });
      if (!modelCallReportResult.ok) {
        throw new Error(modelCallReportResult.error.message);
      }
      const applicationModelCallReport = modelCallReportOutput(modelCallReportResult.output);
      const modelCallReport = applicationModelCallReport.report;
      const modelCallIndex = praxis.runtime.createRuntimeModelCallIndex(modelCallReport);
      const openaiModelCalls = praxis.runtime.queryRuntimeModelCalls({
        report: modelCallReport,
        query: { provider: "openai", status: "completed" },
      });
      const cacheDebugModelCalls = applicationModelCallReport.query;
      const primaryEndpointCalls = praxis.runtime.queryRuntimeModelCalls({
        report: modelCallReport,
        query: { endpointRef: "primary" },
      });
      const serializedModelCallReport = JSON.stringify(modelCallReport);
      const view = second.view;
      const cacheEvents = modelCompletedCacheEvents(events);
      const firstCache = cacheDebugFromEvent(events.find((event) =>
        event.kind === "model" && record(event.metadata).modelPhase === "completed"
      ) ?? events[0] as PraxisApplicationEvent);
      const providerBodiesSummary = providerBodySummary(providerBodies, cacheEvents);
      const cacheInvariant = {
        stablePrefixHashUnchanged:
          cacheEvents.length === 2 &&
          cacheEvents[0]?.stablePrefixHash !== undefined &&
          cacheEvents[0]?.stablePrefixHash === cacheEvents[1]?.stablePrefixHash,
        dynamicPayloadHashChanged:
          cacheEvents.length === 2 &&
          cacheEvents[0]?.dynamicPayloadHash !== undefined &&
          cacheEvents[0]?.dynamicPayloadHash !== cacheEvents[1]?.dynamicPayloadHash,
        instructionsHashUnchanged:
          cacheEvents.length === 2 &&
          cacheEvents[0]?.instructionsHash !== undefined &&
          cacheEvents[0]?.instructionsHash === cacheEvents[1]?.instructionsHash,
        inputHashChanged:
          cacheEvents.length === 2 &&
          cacheEvents[0]?.inputHash !== undefined &&
          cacheEvents[0]?.inputHash !== cacheEvents[1]?.inputHash,
        promptCacheKeyStable:
          providerBodiesSummary.firstPromptCacheKey !== undefined &&
          providerBodiesSummary.firstPromptCacheKey === providerBodiesSummary.secondPromptCacheKey,
        secondComparisonAvailable:
          cacheEvents[1]?.comparisonStablePrefixChanged === false &&
          cacheEvents[1]?.comparisonDynamicPayloadChanged === true,
      };
      const promptPack = promptPackSummary(firstCache);
      const eventNames = [...new Set(events.map(eventSummary))];
      const modelCallReportPublicSafe =
        !serializedModelCallReport.includes("application-promptpack-cache-smoke-token") &&
        !serializedModelCallReport.includes("refreshToken") &&
        !serializedModelCallReport.includes("authorization");
      return {
        status: second.ok &&
          view.status === "completed" &&
          view.finalOutput === "application promptPack cache second turn completed" &&
          view.counters.turns === 2 &&
          view.counters.modelCalls === 1 &&
          providerCalls === 2 &&
          cacheEvents.length === 2 &&
          cacheEvents.every((event) => event.hasCacheDebug) &&
          cacheInvariant.stablePrefixHashUnchanged &&
          cacheInvariant.dynamicPayloadHashChanged &&
          cacheInvariant.instructionsHashUnchanged &&
          cacheInvariant.inputHashChanged &&
          cacheInvariant.promptCacheKeyStable &&
          cacheInvariant.secondComparisonAvailable &&
          !providerBodiesSummary.firstHasPreviousResponseId &&
          !providerBodiesSummary.secondHasPreviousResponseId &&
          promptPack.cacheablePrefixEstimatedTokens > 0 &&
          promptPack.dynamicEstimatedTokens > 0 &&
          modelCallReport.counts.modelCalls === 2 &&
          modelCallReport.counts.completed === 2 &&
          modelCallReport.counts.withUsage === 2 &&
          modelCallReport.counts.withCacheDebug === 2 &&
          modelCallReport.counts.cacheTelemetryModelCalls === 2 &&
          modelCallReport.promptCacheKeys.length === 1 &&
          modelCallReport.usageTotals.weightedCacheHitRate === 160 / 450 &&
          applicationModelCallReport.kind === "praxis.application.modelCallReport" &&
          applicationModelCallReport.publicSafe &&
          applicationModelCallReport.sessionId === view.sessionId &&
          applicationModelCallReport.runtimeId === view.runtimeId &&
          applicationModelCallReport.index.totalModelCalls === 2 &&
          applicationModelCallReport.query.returnedModelCalls === 2 &&
          openaiModelCalls.returnedModelCalls === 2 &&
          cacheDebugModelCalls.returnedModelCalls === 2 &&
          primaryEndpointCalls.returnedModelCalls === 2 &&
          modelCallReport.modelCalls[1]?.cache.comparisonStablePrefixChanged === false &&
          modelCallReport.modelCalls[1]?.cache.comparisonDynamicPayloadChanged === true &&
          modelCallReportPublicSafe
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          status: view.status,
          finalOutput: view.finalOutput,
          counters: view.counters,
          usage: view.usage,
          context: view.context,
        },
        providerCalls,
        providerBodies: providerBodiesSummary,
        cacheEvents,
        cacheInvariant,
        modelCallReport: {
          applicationCommandKind: applicationModelCallReport.kind,
          applicationQueryModelCalls: applicationModelCallReport.query.returnedModelCalls,
          reportStatus: modelCallReport.kind === "praxis.runtime.modelCall.report" ? "ok" : "failed",
          modelCalls: modelCallReport.counts.modelCalls,
          completed: modelCallReport.counts.completed,
          withUsage: modelCallReport.counts.withUsage,
          withCacheDebug: modelCallReport.counts.withCacheDebug,
          cacheTelemetryModelCalls: modelCallReport.counts.cacheTelemetryModelCalls,
          promptCacheKeys: modelCallReport.promptCacheKeys,
          weightedCacheHitRate: modelCallReport.usageTotals.weightedCacheHitRate,
          openaiModelCalls: openaiModelCalls.returnedModelCalls,
          cacheDebugModelCalls: cacheDebugModelCalls.returnedModelCalls,
          primaryEndpointCalls: primaryEndpointCalls.returnedModelCalls,
          stablePrefixUnchanged: modelCallReport.modelCalls[1]?.cache.comparisonStablePrefixChanged === false,
          dynamicPayloadChanged: modelCallReport.modelCalls[1]?.cache.comparisonDynamicPayloadChanged === true,
          publicSafe: modelCallReport.publicSafe && modelCallReportPublicSafe && modelCallIndex.publicSafe,
        },
        promptPack,
        events: eventNames,
        applicationArtifacts: input.includeApplicationArtifacts ? {
          events,
          view,
        } : undefined,
      };
    } finally {
      unsubscribe();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationPromptPackCacheSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
