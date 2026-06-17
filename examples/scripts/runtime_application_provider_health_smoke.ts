import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationRestServer,
  createApplicationWebSocketServer,
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationProtocolMessage,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

type ProviderHealthScenarioStatus = "ok" | "failed";

type ProviderHealthScenarioSummary = {
  status: ProviderHealthScenarioStatus;
  providerCalls: number;
  callOrder: readonly string[];
  authSelections: readonly unknown[];
  view: {
    status: PraxisApplicationViewModel["status"];
    counters: PraxisApplicationViewModel["counters"];
    finalOutput: string | undefined;
    error: PraxisApplicationViewModel["error"];
  };
  modelFailedEvents: number;
  modelCompletedEvents: number;
  modelEventMetadata: readonly {
    phase: string;
    carrierId: string | undefined;
    endpointRef: string | undefined;
    fallbackFrom: string | undefined;
    retryAttempt: number | undefined;
    maxRetries: number | undefined;
    failureCode: string | undefined;
    failureRetryable: boolean;
    adaptiveSelection: boolean;
    requiredCapabilities: readonly string[];
  }[];
  events: readonly string[];
};

export type RuntimeApplicationProviderHealthSmokeResult = {
  status: ProviderHealthScenarioStatus;
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  retryThenFallback: ProviderHealthScenarioSummary;
  nonRetryableFailure: ProviderHealthScenarioSummary;
  publicSafety: {
    viewContainsSecret: boolean;
    eventsContainSecret: boolean;
  };
  applicationArtifacts?: {
    retryThenFallback: {
      events: readonly PraxisApplicationEvent[];
      view: PraxisApplicationViewModel;
      restView?: PraxisApplicationViewModel;
      streamEvents?: readonly PraxisApplicationEvent[];
      webSocketEvents?: readonly PraxisApplicationEvent[];
      sawInitialView?: boolean;
      sawWebSocketReady?: boolean;
    };
    nonRetryableFailure: {
      events: readonly PraxisApplicationEvent[];
      view: PraxisApplicationViewModel;
      restView?: PraxisApplicationViewModel;
      streamEvents?: readonly PraxisApplicationEvent[];
      webSocketEvents?: readonly PraxisApplicationEvent[];
      sawInitialView?: boolean;
      sawWebSocketReady?: boolean;
    };
  };
};

export type RuntimeApplicationProviderHealthSmokeInput = {
  now?: () => string;
  projectRoot?: string;
  includeApplicationArtifacts?: boolean;
  includeTimelineArtifacts?: boolean;
};

const RAW_PRIMARY_SECRET = "sk-application-provider-health-primary";
const RAW_FALLBACK_SECRET = "sk-application-provider-health-fallback";
const MASTER_KEY = "application-provider-health-master-key";
const PRIMARY_PROFILE_REF = "profile.example.applicationProviderHealth.primary";
const FALLBACK_PROFILE_REF = "profile.example.applicationProviderHealth.fallback";
const PRIMARY_MODEL_ENTRY_REF = "model.example.applicationProviderHealth.primary";
const FALLBACK_MODEL_ENTRY_REF = "model.example.applicationProviderHealth.fallback";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
          if (event.kind === "final" || event.kind === "error") controller.abort();
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

async function collectApplicationWebSocketEvents<T>(input: {
  url: string;
  action: () => Promise<T>;
  timeoutMs?: number;
}): Promise<{
  sawReady: boolean;
  events: PraxisApplicationEvent[];
  result: T;
}> {
  const socket = new WebSocket(input.url);
  const events: PraxisApplicationEvent[] = [];
  let sawReady = false;
  let resolveDone: (() => void) | undefined;
  let rejectDone: ((error: unknown) => void) | undefined;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const timeout = setTimeout(() => {
    socket.close();
    rejectDone?.(new Error("timed out waiting for websocket application events"));
  }, input.timeoutMs ?? 5_000);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as PraxisApplicationProtocolMessage;
    if (message.type === "application.ready") {
      sawReady = true;
      return;
    }
    if (message.type !== "application.event") return;
    events.push(message.event);
    if (message.event.kind === "final" || message.event.kind === "error") resolveDone?.();
  });
  socket.addEventListener("error", (event) => rejectDone?.(event));

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", (event) => reject(event), { once: true });
  });
  const result = await input.action();
  await done;
  clearTimeout(timeout);
  socket.close();
  return { sawReady, events, result };
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "model") return event.kind;
  const metadata = record(event.metadata);
  const modelPhase = String(metadata.modelPhase ?? "unknown");
  const carrierId = stringValue(metadata.carrierId) ?? "unknown-carrier";
  return `model:${modelPhase}:${carrierId}`;
}

function includesRawSecret(value: unknown): boolean {
  const text = JSON.stringify(value);
  return text.includes(RAW_PRIMARY_SECRET) || text.includes(RAW_FALLBACK_SECRET);
}

function modelPhaseCount(events: readonly PraxisApplicationEvent[], phase: "completed" | "failed"): number {
  return events.filter((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === phase
  ).length;
}

function modelEventMetadata(events: readonly PraxisApplicationEvent[]): ProviderHealthScenarioSummary["modelEventMetadata"] {
  return events
    .filter((event) => event.kind === "model" && record(event.metadata).modelPhase !== "started")
    .map((event) => {
      const metadata = record(event.metadata);
      return {
        phase: String(metadata.modelPhase ?? "unknown"),
        carrierId: stringValue(metadata.carrierId),
        endpointRef: stringValue(metadata.modelFleetEndpointRef),
        fallbackFrom: stringValue(metadata.fallbackFrom),
        retryAttempt: numberValue(metadata.modelFleetRetryAttempt),
        maxRetries: numberValue(metadata.modelFleetMaxRetries),
        failureCode: stringValue(metadata.modelFailureCode),
        failureRetryable: booleanValue(metadata.modelFailureRetryable),
        adaptiveSelection: booleanValue(metadata.modelFleetAdaptiveSelection),
        requiredCapabilities: stringArray(metadata.modelFleetRequiredCapabilities),
      };
    });
}

function hasEventMetadata(
  events: readonly ProviderHealthScenarioSummary["modelEventMetadata"][number][],
  expected: Partial<ProviderHealthScenarioSummary["modelEventMetadata"][number]> & {
    requiredCapability?: string;
  },
): boolean {
  return events.some((event) =>
    (expected.phase === undefined || event.phase === expected.phase) &&
    (expected.carrierId === undefined || event.carrierId === expected.carrierId) &&
    (expected.endpointRef === undefined || event.endpointRef === expected.endpointRef) &&
    (expected.fallbackFrom === undefined || event.fallbackFrom === expected.fallbackFrom) &&
    (expected.retryAttempt === undefined || event.retryAttempt === expected.retryAttempt) &&
    (expected.maxRetries === undefined || event.maxRetries === expected.maxRetries) &&
    (expected.failureCode === undefined || event.failureCode === expected.failureCode) &&
    (expected.failureRetryable === undefined || event.failureRetryable === expected.failureRetryable) &&
    (expected.adaptiveSelection === undefined || event.adaptiveSelection === expected.adaptiveSelection) &&
    (expected.requiredCapability === undefined || event.requiredCapabilities.includes(expected.requiredCapability))
  );
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationProviderHealthSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationProviderHealth";
  model = praxis.model("gpt-5.5-primary", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationProviderHealth.primary",
    providerProfileRef: "${PRIMARY_PROFILE_REF}",
    modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
    metadata: { providerRoute: "openai_responses" },
  });
  modelFleet = praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-primary",
      carrierId: "carrier.example.applicationProviderHealth.primary",
      providerProfileRef: "${PRIMARY_PROFILE_REF}",
      modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
      failurePolicy: {
        onUnavailable: "fallback",
        fallbackEndpointRef: "fallback",
        maxRetries: 1,
      },
      metadata: { providerRoute: "openai_responses" },
    }),
    fallback: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-fallback",
      carrierId: "carrier.example.applicationProviderHealth.fallback",
      providerProfileRef: "${FALLBACK_PROFILE_REF}",
      modelEntryRef: "${FALLBACK_MODEL_ENTRY_REF}",
      failurePolicy: { onUnavailable: "fail", maxRetries: 0 },
      metadata: { providerRoute: "openai_responses" },
    }),
  }, {
    primaryRef: "primary",
    failurePolicy: {
      onUnavailable: "fallback",
      fallbackEndpointRef: "fallback",
      maxRetries: 1,
    },
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    modelFleetRef: "modelFleet.example.applicationProviderHealth",
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: false,
      scopes: ["agent.invoke"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 1,
      maxToolCalls: 0,
    }),
  });
}

export default ApplicationProviderHealthSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-provider-health-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationProviderHealthSmokeAgent",
    application: { id: "application.provider-health-smoke" },
    agent: { id: "agent.example.applicationProviderHealth" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function createResolver(now: () => string) {
  const primarySecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderHealth.primary",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_PRIMARY_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  const fallbackSecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderHealth.fallback",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_FALLBACK_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  if (!primarySecret.ok) throw new Error(primarySecret.error.message);
  if (!fallbackSecret.ok) throw new Error(fallbackSecret.error.message);

  const primaryCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderHealth.primary",
    secretId: primarySecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const fallbackCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderHealth.fallback",
    secretId: fallbackSecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const primaryProfile = praxis.auth.profile({
    profileId: PRIMARY_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://primary.provider-health.test",
    credentialRef: primaryCredential,
    now: now(),
  });
  const fallbackProfile = praxis.auth.profile({
    profileId: FALLBACK_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://fallback.provider-health.test",
    credentialRef: fallbackCredential,
    now: now(),
  });
  const primaryModel = praxis.auth.modelEntry({
    modelEntryId: PRIMARY_MODEL_ENTRY_REF,
    providerProfileRef: PRIMARY_PROFILE_REF,
    model: "gpt-5.5-primary",
  });
  const fallbackModel = praxis.auth.modelEntry({
    modelEntryId: FALLBACK_MODEL_ENTRY_REF,
    providerProfileRef: FALLBACK_PROFILE_REF,
    model: "gpt-5.5-fallback",
  });
  if (!primaryProfile.ok) throw new Error(primaryProfile.error.message);
  if (!fallbackProfile.ok) throw new Error(fallbackProfile.error.message);
  if (!primaryModel.ok) throw new Error(primaryModel.error.message);
  if (!fallbackModel.ok) throw new Error(fallbackModel.error.message);

  return praxis.auth.resolver({
    registry: praxis.auth.registry({
      profiles: [primaryProfile.value, fallbackProfile.value],
      modelEntries: [primaryModel.value, fallbackModel.value],
    }),
    vault: praxis.auth.vault([primarySecret.value, fallbackSecret.value]),
    keyProvider: () => MASTER_KEY,
    now,
  });
}

function carrierIdFromRequest(request: unknown): string {
  const body = record(record(request).body);
  return body.model === "gpt-5.5-fallback"
    ? "carrier.example.applicationProviderHealth.fallback"
    : "carrier.example.applicationProviderHealth.primary";
}

function viewSummary(view: PraxisApplicationViewModel): ProviderHealthScenarioSummary["view"] {
  return {
    status: view.status,
    counters: view.counters,
    finalOutput: view.finalOutput,
    error: view.error,
  };
}

async function runScenario(input: {
  projectRoot: string;
  now: () => string;
  failureStatus: number;
  prompt: string;
  includeTimelineArtifacts?: boolean;
}): Promise<ProviderHealthScenarioSummary & {
  eventsForSafety: readonly PraxisApplicationEvent[];
  viewForSafety: PraxisApplicationViewModel;
  restViewForSafety?: PraxisApplicationViewModel;
  streamEventsForSafety?: readonly PraxisApplicationEvent[];
  webSocketEventsForSafety?: readonly PraxisApplicationEvent[];
  sawInitialView?: boolean;
  sawWebSocketReady?: boolean;
}> {
  const resolver = await createResolver(input.now);
  const events: PraxisApplicationEvent[] = [];
  const authSelections: unknown[] = [];
  const providerRequests: unknown[] = [];
  const runtimeAuthResolver = {
    resolve: async (request: Parameters<typeof resolver.resolve>[0]) => {
      authSelections.push(request);
      return resolver.resolve(request);
    },
  };
  const created = await createApplicationProjectRuntime(input.projectRoot, {
    now: input.now,
    mode: "live",
    liveProviderResolver: async () => ({
      runtimeAuthResolver,
      provider: "openai",
      endpointShape: "responses",
      openaiResponsesCaller: async (request) => {
        providerRequests.push(request);
        if (record(request.body).model === "gpt-5.5-primary") {
          throw Object.assign(new Error(`primary provider status ${input.failureStatus}`), {
            status: input.failureStatus,
          });
        }
        return {
          id: "resp_application_provider_health_fallback",
          output_text: "application provider health fallback ok",
          usage: {
            input_tokens: 82,
            output_tokens: 9,
            total_tokens: 91,
            input_tokens_details: { cached_tokens: 31 },
          },
        };
      },
    }),
  });
  if (!created.ok) throw new Error(created.error.message);
  const unsubscribe = created.runtime.subscribe((event) => events.push(event));
  try {
    const transport = createLocalApplicationTransport(created.runtime);
    const submitTurn = () => transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: input.prompt,
        cwd: input.projectRoot,
      },
    });
    let restViewForSafety: PraxisApplicationViewModel | undefined;
    let streamEventsForSafety: readonly PraxisApplicationEvent[] | undefined;
    let webSocketEventsForSafety: readonly PraxisApplicationEvent[] | undefined;
    let sawInitialView: boolean | undefined;
    let sawWebSocketReady: boolean | undefined;
    if (input.includeTimelineArtifacts) {
      const rest = await createApplicationRestServer(created.runtime);
      const webSocket = await createApplicationWebSocketServer(created.runtime);
      try {
        let releaseWebSocketReady: (() => void) | undefined;
        const webSocketReady = new Promise<void>((resolve) => {
          releaseWebSocketReady = resolve;
        });
        const [stream, webSocketStream] = await Promise.all([
          collectApplicationEventStream({
            url: rest.url,
            action: async () => {
              await webSocketReady;
              return await submitTurn();
            },
          }),
          collectApplicationWebSocketEvents({
            url: webSocket.url,
            action: async () => {
              releaseWebSocketReady?.();
            },
          }),
        ]);
        restViewForSafety = await readRestView(rest.url);
        streamEventsForSafety = stream.events;
        webSocketEventsForSafety = webSocketStream.events;
        sawInitialView = stream.sawInitialView;
        sawWebSocketReady = webSocketStream.sawReady;
      } finally {
        await webSocket.close();
        await rest.close();
      }
    } else {
      await submitTurn();
    }
    const view = created.runtime.getView();
    return {
      status: "failed",
      providerCalls: providerRequests.length,
      callOrder: providerRequests.map(carrierIdFromRequest),
      authSelections,
      view: viewSummary(view),
      modelFailedEvents: modelPhaseCount(events, "failed"),
      modelCompletedEvents: modelPhaseCount(events, "completed"),
      modelEventMetadata: modelEventMetadata(events),
      events: events.map(eventSummary),
      eventsForSafety: events,
      viewForSafety: view,
      restViewForSafety,
      streamEventsForSafety,
      webSocketEventsForSafety,
      sawInitialView,
      sawWebSocketReady,
    };
  } finally {
    unsubscribe();
  }
}

export async function runApplicationProviderHealthSmoke(
  input: RuntimeApplicationProviderHealthSmokeInput = {},
): Promise<RuntimeApplicationProviderHealthSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-provider-health-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const retryThenFallbackRaw = await runScenario({
      projectRoot,
      now,
      failureStatus: 429,
      prompt: "Use the provider health policy. The primary is rate-limited, so retry once and then use fallback.",
      includeTimelineArtifacts: input.includeTimelineArtifacts,
    });
    const {
      eventsForSafety: retryThenFallbackEventsForSafety,
      viewForSafety: retryThenFallbackViewForSafety,
      ...retryThenFallbackSummary
    } = retryThenFallbackRaw;
    const retryThenFallback: ProviderHealthScenarioSummary = {
      ...retryThenFallbackSummary,
      status: retryThenFallbackSummary.providerCalls === 3 &&
        retryThenFallbackSummary.callOrder[0] === "carrier.example.applicationProviderHealth.primary" &&
        retryThenFallbackSummary.callOrder[1] === "carrier.example.applicationProviderHealth.primary" &&
        retryThenFallbackSummary.callOrder[2] === "carrier.example.applicationProviderHealth.fallback" &&
        retryThenFallbackSummary.modelFailedEvents === 2 &&
        retryThenFallbackSummary.modelCompletedEvents === 1 &&
        hasEventMetadata(retryThenFallbackSummary.modelEventMetadata, {
          phase: "failed",
          carrierId: "carrier.example.applicationProviderHealth.primary",
          endpointRef: "primary",
          retryAttempt: 0,
          maxRetries: 1,
          failureCode: "PROVIDER_RATE_LIMITED",
          failureRetryable: true,
          requiredCapability: "toolCalling",
        }) &&
        hasEventMetadata(retryThenFallbackSummary.modelEventMetadata, {
          phase: "failed",
          carrierId: "carrier.example.applicationProviderHealth.primary",
          endpointRef: "primary",
          retryAttempt: 1,
          maxRetries: 1,
          failureCode: "PROVIDER_RATE_LIMITED",
          failureRetryable: true,
          requiredCapability: "toolCalling",
        }) &&
        hasEventMetadata(retryThenFallbackSummary.modelEventMetadata, {
          phase: "completed",
          carrierId: "carrier.example.applicationProviderHealth.fallback",
          endpointRef: "fallback",
          fallbackFrom: "primary",
          retryAttempt: 0,
          maxRetries: 0,
          requiredCapability: "toolCalling",
        }) &&
        retryThenFallbackSummary.view.status === "completed" &&
        retryThenFallbackSummary.view.finalOutput === "application provider health fallback ok"
        ? "ok"
        : "failed",
    };

    const nonRetryableFailureRaw = await runScenario({
      projectRoot,
      now,
      failureStatus: 400,
      prompt: "Use the provider health policy. The primary request is invalid, so do not hide it with fallback.",
      includeTimelineArtifacts: input.includeTimelineArtifacts,
    });
    const {
      eventsForSafety: nonRetryableFailureEventsForSafety,
      viewForSafety: nonRetryableFailureViewForSafety,
      ...nonRetryableFailureSummary
    } = nonRetryableFailureRaw;
    const nonRetryableFailure: ProviderHealthScenarioSummary = {
      ...nonRetryableFailureSummary,
      status: nonRetryableFailureSummary.providerCalls === 1 &&
        nonRetryableFailureSummary.callOrder[0] === "carrier.example.applicationProviderHealth.primary" &&
        nonRetryableFailureSummary.modelFailedEvents === 1 &&
        nonRetryableFailureSummary.modelCompletedEvents === 0 &&
        hasEventMetadata(nonRetryableFailureSummary.modelEventMetadata, {
          phase: "failed",
          carrierId: "carrier.example.applicationProviderHealth.primary",
          endpointRef: "primary",
          retryAttempt: 0,
          maxRetries: 1,
          failureCode: "CALLER_FAILED",
          failureRetryable: false,
          requiredCapability: "toolCalling",
        }) &&
        nonRetryableFailureSummary.view.status === "failed"
        ? "ok"
        : "failed",
    };

    const safetyViews = [retryThenFallbackViewForSafety, nonRetryableFailureViewForSafety];
    const safetyEvents = [...retryThenFallbackEventsForSafety, ...nonRetryableFailureEventsForSafety];
    return {
      status: retryThenFallback.status === "ok" && nonRetryableFailure.status === "ok" ? "ok" : "failed",
      startedAt,
      finishedAt: now(),
      projectRoot,
      retryThenFallback,
      nonRetryableFailure,
      publicSafety: {
        viewContainsSecret: includesRawSecret(safetyViews),
        eventsContainSecret: includesRawSecret(safetyEvents),
      },
      applicationArtifacts: input.includeApplicationArtifacts ? {
        retryThenFallback: {
          events: retryThenFallbackEventsForSafety,
          view: retryThenFallbackViewForSafety,
          restView: retryThenFallbackRaw.restViewForSafety,
          streamEvents: retryThenFallbackRaw.streamEventsForSafety,
          webSocketEvents: retryThenFallbackRaw.webSocketEventsForSafety,
          sawInitialView: retryThenFallbackRaw.sawInitialView,
          sawWebSocketReady: retryThenFallbackRaw.sawWebSocketReady,
        },
        nonRetryableFailure: {
          events: nonRetryableFailureEventsForSafety,
          view: nonRetryableFailureViewForSafety,
          restView: nonRetryableFailureRaw.restViewForSafety,
          streamEvents: nonRetryableFailureRaw.streamEventsForSafety,
          webSocketEvents: nonRetryableFailureRaw.webSocketEventsForSafety,
          sawInitialView: nonRetryableFailureRaw.sawInitialView,
          sawWebSocketReady: nonRetryableFailureRaw.sawWebSocketReady,
        },
      } : undefined,
    };
  } finally {
    if (ownsProjectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationProviderHealthSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
