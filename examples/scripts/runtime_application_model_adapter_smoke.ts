import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

type UsageSummary = {
  source: string | undefined;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  cachedInputTokens: number | undefined;
};

export type RuntimeApplicationModelAdapterRouteSummary = {
  providerCalls: number;
  endpoint: string | undefined;
  url: string | undefined;
  authHeaderRedacted: boolean;
  finalOutput: string | undefined;
  modelCompletedEvents: number;
  applicationModelEventCarriesAdapterUsage: boolean;
  usage: UsageSummary;
};

export type RuntimeApplicationModelAdapterSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  routes: {
    openaiResponses: RuntimeApplicationModelAdapterRouteSummary & {
      promptCacheKeyPresent: boolean;
      providerFieldsOpaque: boolean;
    };
    openaiChatCompletions: RuntimeApplicationModelAdapterRouteSummary & {
      requestBodyHasMessages: boolean;
      streamOptionsIncludeUsage: boolean;
    };
  };
  views: {
    openaiResponses: {
      status: PraxisApplicationViewModel["status"];
      counters: PraxisApplicationViewModel["counters"];
      finalOutput: string | undefined;
      usage: PraxisApplicationViewModel["usage"];
    };
    openaiChatCompletions: {
      status: PraxisApplicationViewModel["status"];
      counters: PraxisApplicationViewModel["counters"];
      finalOutput: string | undefined;
      usage: PraxisApplicationViewModel["usage"];
    };
  };
  events: {
    openaiResponses: readonly string[];
    openaiChatCompletions: readonly string[];
  };
};

export type RuntimeApplicationModelAdapterSmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

type ModelAdapterRouteKind = "responses" | "chat_completions";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function usageFromEvent(events: readonly PraxisApplicationEvent[]): UsageSummary {
  const completed = events.find((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === "completed"
  );
  const usage = record(record(completed?.metadata).usage);
  return {
    source: stringValue(usage.source),
    inputTokens: numberValue(usage.inputTokens),
    outputTokens: numberValue(usage.outputTokens),
    totalTokens: numberValue(usage.totalTokens),
    cachedInputTokens: numberValue(usage.cachedInputTokens),
  };
}

function modelCompletedEventCount(events: readonly PraxisApplicationEvent[]): number {
  return events.filter((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === "completed"
  ).length;
}

function applicationModelEventCarriesAdapterUsage(events: readonly PraxisApplicationEvent[]): boolean {
  const usage = usageFromEvent(events);
  return modelCompletedEventCount(events) > 0 &&
    (usage.source === "openai.responses.usage" || usage.source === "openai.chat_completions.usage");
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "model") return event.kind;
  const metadata = record(event.metadata);
  return `model:${String(metadata.modelPhase ?? "unknown")}`;
}

function authEnvelope(id: string) {
  const ref = praxis.modelAuth.credentialRef({
    id,
    provider: "openai",
    credentialType: "openai_api_key",
    source: { kind: "test", label: id },
  });
  if (!ref.ok) throw new Error(`Failed to create credential ref for ${id}.`);
  return praxis.modelAuth.apiKeyEnvelope({
    credentialRef: ref.credentialRef,
    apiKey: `${id}-secret-token`,
  }).envelope;
}

function agentSource(input: {
  className: string;
  identity: string;
  carrierId: string;
  endpointShape: ModelAdapterRouteKind;
}): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ${input.className} extends praxis.Agent {
  identity = "${input.identity}";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "${input.endpointShape}",
    carrierId: "${input.carrierId}",
    baseURL: "https://api.openai.test",
    metadata: { providerRoute: "${input.endpointShape === "responses" ? "openai_responses" : "openai_chat_completions"}" },
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
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

export default ${input.className};
`;
}

async function createSmokeProject(root: string, input: {
  routeKind: ModelAdapterRouteKind;
  className: string;
  identity: string;
  carrierId: string;
  applicationId: string;
}): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: input.applicationId,
    entry: "praxis.agent.ts",
    export: input.className,
    application: { id: input.applicationId },
    agent: { id: input.identity },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), agentSource({
    className: input.className,
    identity: input.identity,
    carrierId: input.carrierId,
    endpointShape: input.routeKind,
  }));
}

function viewSummary(view: PraxisApplicationViewModel): RuntimeApplicationModelAdapterSmokeResult["views"]["openaiResponses"] {
  return {
    status: view.status,
    counters: view.counters,
    finalOutput: view.finalOutput,
    usage: view.usage,
  };
}

async function runResponsesRoute(input: {
  root: string;
  now: () => string;
}): Promise<{
  view: PraxisApplicationViewModel;
  events: PraxisApplicationEvent[];
  calls: unknown[];
  summary: RuntimeApplicationModelAdapterSmokeResult["routes"]["openaiResponses"];
}> {
  await createSmokeProject(input.root, {
    routeKind: "responses",
    className: "ApplicationModelAdapterResponsesSmokeAgent",
    identity: "agent.example.applicationModelAdapter.responses",
    carrierId: "carrier.example.applicationModelAdapter.responses",
    applicationId: "application.model-adapter.responses-smoke",
  });

  const events: PraxisApplicationEvent[] = [];
  const calls: unknown[] = [];
  const created = await createApplicationProjectRuntime(input.root, {
    now: input.now,
    mode: "live",
    liveProviderResolver: async () => ({
      auth: authEnvelope("application-model-adapter-responses"),
      provider: "openai",
      endpointShape: "responses",
      baseURL: "https://api.openai.test",
      providerRoute: "openai_responses",
      openaiResponsesCaller: async (envelope) => {
        calls.push(envelope);
        return {
          id: "resp_application_model_adapter",
          output_text: "application modelAdapter responses ok",
          usage: {
            input_tokens: 80,
            output_tokens: 9,
            total_tokens: 89,
            input_tokens_details: { cached_tokens: 33 },
          },
        };
      },
    }),
  });
  if (!created.ok) throw new Error(created.error.message);
  const unsubscribe = created.runtime.subscribe((event) => events.push(event));
  try {
    const transport = createLocalApplicationTransport(created.runtime);
    await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "Route this turn through the OpenAI Responses adapter.",
        cwd: input.root,
      },
    });
    const view = created.runtime.getView();
    const firstCall = record(calls[0]);
    const body = record(firstCall.body);
    return {
      view,
      events,
      calls,
      summary: {
        providerCalls: calls.length,
        endpoint: stringValue(firstCall.endpoint),
        url: stringValue(firstCall.url),
        authHeaderRedacted: stringValue(record(firstCall.headers).authorization)?.startsWith("[redacted:") === true,
        finalOutput: view.finalOutput,
        modelCompletedEvents: modelCompletedEventCount(events),
        applicationModelEventCarriesAdapterUsage: applicationModelEventCarriesAdapterUsage(events),
        usage: usageFromEvent(events),
        promptCacheKeyPresent: stringValue(body.prompt_cache_key) !== undefined,
        providerFieldsOpaque: firstCall.providerFieldsOpaque === true,
      },
    };
  } finally {
    unsubscribe();
  }
}

async function runChatCompletionsRoute(input: {
  root: string;
  now: () => string;
}): Promise<{
  view: PraxisApplicationViewModel;
  events: PraxisApplicationEvent[];
  calls: unknown[];
  summary: RuntimeApplicationModelAdapterSmokeResult["routes"]["openaiChatCompletions"];
}> {
  await createSmokeProject(input.root, {
    routeKind: "chat_completions",
    className: "ApplicationModelAdapterChatCompletionsSmokeAgent",
    identity: "agent.example.applicationModelAdapter.chatCompletions",
    carrierId: "carrier.example.applicationModelAdapter.chatCompletions",
    applicationId: "application.model-adapter.chat-completions-smoke",
  });

  const events: PraxisApplicationEvent[] = [];
  const calls: unknown[] = [];
  const created = await createApplicationProjectRuntime(input.root, {
    now: input.now,
    mode: "live",
    liveProviderResolver: async () => ({
      auth: authEnvelope("application-model-adapter-chat-completions"),
      provider: "openai",
      endpointShape: "chat_completions",
      baseURL: "https://api.openai.test",
      providerRoute: "openai_chat_completions",
      openaiChatCompletionsCaller: async (request) => {
        calls.push(request);
        return {
          choices: [{
            message: {
              role: "assistant",
              content: "application modelAdapter chat completions ok",
            },
          }],
          usage: {
            prompt_tokens: 64,
            completion_tokens: 8,
            total_tokens: 72,
            prompt_tokens_details: { cached_tokens: 21 },
          },
        };
      },
    }),
  });
  if (!created.ok) throw new Error(created.error.message);
  const unsubscribe = created.runtime.subscribe((event) => events.push(event));
  try {
    const transport = createLocalApplicationTransport(created.runtime);
    await transport.dispatch({
      type: "application.submitTurn",
      mode: "live",
      input: {
        type: "application.input",
        text: "Route this turn through the OpenAI Chat Completions adapter.",
        cwd: input.root,
      },
    });
    const view = created.runtime.getView();
    const firstCall = record(calls[0]);
    const requestBody = record(firstCall.requestBody);
    const messages = requestBody.messages;
    return {
      view,
      events,
      calls,
      summary: {
        providerCalls: calls.length,
        endpoint: stringValue(firstCall.endpoint),
        url: stringValue(firstCall.url),
        authHeaderRedacted: stringValue(record(firstCall.headers).authorization)?.startsWith("[redacted:") === true,
        finalOutput: view.finalOutput,
        modelCompletedEvents: modelCompletedEventCount(events),
        applicationModelEventCarriesAdapterUsage: applicationModelEventCarriesAdapterUsage(events),
        usage: usageFromEvent(events),
        requestBodyHasMessages: Array.isArray(messages) && messages.length > 0,
        streamOptionsIncludeUsage: record(requestBody.stream_options).include_usage === true,
      },
    };
  } finally {
    unsubscribe();
  }
}

export async function runApplicationModelAdapterSmoke(
  input: RuntimeApplicationModelAdapterSmokeInput = {},
): Promise<RuntimeApplicationModelAdapterSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-model-adapter-smoke-"));
  try {
    const responsesRoot = path.join(projectRoot, "responses");
    const chatRoot = path.join(projectRoot, "chat-completions");
    await mkdir(responsesRoot, { recursive: true });
    await mkdir(chatRoot, { recursive: true });
    const responses = await runResponsesRoute({ root: responsesRoot, now });
    const chatCompletions = await runChatCompletionsRoute({ root: chatRoot, now });
    const status =
      responses.summary.providerCalls === 1 &&
      responses.summary.finalOutput === "application modelAdapter responses ok" &&
      chatCompletions.summary.providerCalls === 1 &&
      chatCompletions.summary.finalOutput === "application modelAdapter chat completions ok"
        ? "ok"
        : "failed";
    return {
      status,
      startedAt,
      finishedAt: now(),
      projectRoot,
      routes: {
        openaiResponses: responses.summary,
        openaiChatCompletions: chatCompletions.summary,
      },
      views: {
        openaiResponses: viewSummary(responses.view),
        openaiChatCompletions: viewSummary(chatCompletions.view),
      },
      events: {
        openaiResponses: responses.events.map(eventSummary),
        openaiChatCompletions: chatCompletions.events.map(eventSummary),
      },
    };
  } finally {
    if (ownsProjectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationModelAdapterSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
