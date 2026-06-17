import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationProviderFleetSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  callOrder: readonly string[];
  authSelections: readonly unknown[];
  view: {
    status: PraxisApplicationViewModel["status"];
    counters: PraxisApplicationViewModel["counters"];
    finalOutput: string | undefined;
    usage: PraxisApplicationViewModel["usage"];
  };
  fallback: {
    primaryFailed: boolean;
    fallbackSucceeded: boolean;
    primaryFailureMetadata: {
      endpointRef: string | undefined;
      fallbackFrom: string | undefined;
      retryAttempt: number | undefined;
      maxRetries: number | undefined;
      failureCode: string | undefined;
      failureRetryable: boolean;
      requiredCapabilities: readonly string[];
    };
    fallbackSuccessMetadata: {
      endpointRef: string | undefined;
      fallbackFrom: string | undefined;
      adaptiveSelection: boolean;
      retryAttempt: number | undefined;
      maxRetries: number | undefined;
      requiredCapabilities: readonly string[];
    };
    modelFailedEvents: number;
    modelCompletedEvents: number;
    fallbackEvents: readonly string[];
  };
  publicSafety: {
    viewContainsSecret: boolean;
    eventsContainSecret: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationProviderFleetSmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

const RAW_PRIMARY_SECRET = "sk-application-provider-fleet-primary";
const RAW_FALLBACK_SECRET = "sk-application-provider-fleet-fallback";
const MASTER_KEY = "application-provider-fleet-master-key";
const PRIMARY_PROFILE_REF = "profile.example.applicationProviderFleet.primary";
const FALLBACK_PROFILE_REF = "profile.example.applicationProviderFleet.fallback";
const PRIMARY_MODEL_ENTRY_REF = "model.example.applicationProviderFleet.primary";
const FALLBACK_MODEL_ENTRY_REF = "model.example.applicationProviderFleet.fallback";

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

function modelEventMetadata(input: {
  events: readonly PraxisApplicationEvent[];
  phase: "completed" | "failed";
  carrierId: string;
}): Readonly<Record<string, unknown>> {
  const found = input.events.find((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === input.phase &&
    record(event.metadata).carrierId === input.carrierId
  );
  return record(found?.metadata);
}

function failureMetadata(metadata: Readonly<Record<string, unknown>>): RuntimeApplicationProviderFleetSmokeResult["fallback"]["primaryFailureMetadata"] {
  return {
    endpointRef: stringValue(metadata.modelFleetEndpointRef),
    fallbackFrom: stringValue(metadata.fallbackFrom),
    retryAttempt: numberValue(metadata.modelFleetRetryAttempt),
    maxRetries: numberValue(metadata.modelFleetMaxRetries),
    failureCode: stringValue(metadata.modelFailureCode),
    failureRetryable: booleanValue(metadata.modelFailureRetryable),
    requiredCapabilities: stringArray(metadata.modelFleetRequiredCapabilities),
  };
}

function successMetadata(metadata: Readonly<Record<string, unknown>>): RuntimeApplicationProviderFleetSmokeResult["fallback"]["fallbackSuccessMetadata"] {
  return {
    endpointRef: stringValue(metadata.modelFleetEndpointRef),
    fallbackFrom: stringValue(metadata.fallbackFrom),
    adaptiveSelection: booleanValue(metadata.modelFleetAdaptiveSelection),
    retryAttempt: numberValue(metadata.modelFleetRetryAttempt),
    maxRetries: numberValue(metadata.modelFleetMaxRetries),
    requiredCapabilities: stringArray(metadata.modelFleetRequiredCapabilities),
  };
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationProviderFleetSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationProviderFleet";
  model = praxis.model("gpt-5.5-primary", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationProviderFleet.primary",
    providerProfileRef: "${PRIMARY_PROFILE_REF}",
    modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
    metadata: { providerRoute: "openai_responses" },
  });
  modelFleet = praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-primary",
      carrierId: "carrier.example.applicationProviderFleet.primary",
      providerProfileRef: "${PRIMARY_PROFILE_REF}",
      modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
      failurePolicy: {
        onUnavailable: "fallback",
        fallbackEndpointRef: "fallback",
        maxRetries: 0,
      },
      metadata: { providerRoute: "openai_responses" },
    }),
    fallback: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-fallback",
      carrierId: "carrier.example.applicationProviderFleet.fallback",
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
      maxRetries: 0,
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
    modelFleetRef: "modelFleet.example.applicationProviderFleet",
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

export default ApplicationProviderFleetSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-provider-fleet-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationProviderFleetSmokeAgent",
    application: { id: "application.provider-fleet-smoke" },
    agent: { id: "agent.example.applicationProviderFleet" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function createResolver(now: () => string) {
  const primarySecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderFleet.primary",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_PRIMARY_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  const fallbackSecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderFleet.fallback",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_FALLBACK_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  if (!primarySecret.ok) throw new Error(primarySecret.error.message);
  if (!fallbackSecret.ok) throw new Error(fallbackSecret.error.message);

  const primaryCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderFleet.primary",
    secretId: primarySecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const fallbackCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderFleet.fallback",
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
    baseURL: "https://primary.provider-fleet.test",
    credentialRef: primaryCredential,
    now: now(),
  });
  const fallbackProfile = praxis.auth.profile({
    profileId: FALLBACK_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://fallback.provider-fleet.test",
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

function viewSummary(view: PraxisApplicationViewModel): RuntimeApplicationProviderFleetSmokeResult["view"] {
  return {
    status: view.status,
    counters: view.counters,
    finalOutput: view.finalOutput,
    usage: view.usage,
  };
}

function carrierIdFromRequest(request: unknown): string {
  const runtime = record(record(request).runtime);
  const invocationId = stringValue(runtime.invocationId) ?? "";
  if (invocationId.includes("fallback")) return "carrier.example.applicationProviderFleet.fallback";
  return "carrier.example.applicationProviderFleet.primary";
}

export async function runApplicationProviderFleetSmoke(
  input: RuntimeApplicationProviderFleetSmokeInput = {},
): Promise<RuntimeApplicationProviderFleetSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-provider-fleet-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const resolver = await createResolver(now);
    const events: PraxisApplicationEvent[] = [];
    const authSelections: unknown[] = [];
    const providerRequests: unknown[] = [];
    const runtimeAuthResolver = {
      resolve: async (request: Parameters<typeof resolver.resolve>[0]) => {
        authSelections.push(request);
        return resolver.resolve(request);
      },
    };
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      liveProviderResolver: async () => ({
        runtimeAuthResolver,
        provider: "openai",
        endpointShape: "responses",
        openaiResponsesCaller: async (request) => {
          providerRequests.push(request);
          if (record(request.body).model === "gpt-5.5-primary") {
            throw Object.assign(new Error("primary provider unavailable"), { status: 503 });
          }
          return {
            id: "resp_application_provider_fleet_fallback",
            output_text: "application provider fleet fallback ok",
            usage: {
              input_tokens: 70,
              output_tokens: 8,
              total_tokens: 78,
              input_tokens_details: { cached_tokens: 29 },
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
          text: "Use the manifest-declared provider fleet and fall back if the primary is unavailable.",
          cwd: projectRoot,
        },
      });
      const view = created.runtime.getView();
      const callOrder = providerRequests.map(carrierIdFromRequest);
      const fallbackEvents = events
        .map(eventSummary)
        .filter((item) => item.includes("applicationProviderFleet"));
      const primaryFailed = callOrder[0] === "carrier.example.applicationProviderFleet.primary" &&
        modelPhaseCount(events, "failed") >= 1;
      const fallbackSucceeded = callOrder[1] === "carrier.example.applicationProviderFleet.fallback" &&
        view.finalOutput === "application provider fleet fallback ok" &&
        modelPhaseCount(events, "completed") >= 1;
      const primaryFailureMetadata = failureMetadata(modelEventMetadata({
        events,
        phase: "failed",
        carrierId: "carrier.example.applicationProviderFleet.primary",
      }));
      const fallbackSuccessMetadata = successMetadata(modelEventMetadata({
        events,
        phase: "completed",
        carrierId: "carrier.example.applicationProviderFleet.fallback",
      }));
      const metadataVisible = primaryFailureMetadata.endpointRef === "primary" &&
        primaryFailureMetadata.retryAttempt === 0 &&
        primaryFailureMetadata.maxRetries === 0 &&
        primaryFailureMetadata.failureRetryable &&
        primaryFailureMetadata.failureCode === "PROVIDER_UNAVAILABLE" &&
        fallbackSuccessMetadata.endpointRef === "fallback" &&
        fallbackSuccessMetadata.fallbackFrom === "primary" &&
        fallbackSuccessMetadata.retryAttempt === 0 &&
        fallbackSuccessMetadata.maxRetries === 0 &&
        fallbackSuccessMetadata.requiredCapabilities.includes("toolCalling");
      const status = providerRequests.length === 2 && primaryFailed && fallbackSucceeded && metadataVisible ? "ok" : "failed";
      return {
        status,
        startedAt,
        finishedAt: now(),
        projectRoot,
        providerCalls: providerRequests.length,
        callOrder,
        authSelections,
        view: viewSummary(view),
        fallback: {
          primaryFailed,
          fallbackSucceeded,
          primaryFailureMetadata,
          fallbackSuccessMetadata,
          modelFailedEvents: modelPhaseCount(events, "failed"),
          modelCompletedEvents: modelPhaseCount(events, "completed"),
          fallbackEvents,
        },
        publicSafety: {
          viewContainsSecret: includesRawSecret(view),
          eventsContainSecret: includesRawSecret(events),
        },
        events: events.map(eventSummary),
      };
    } finally {
      unsubscribe();
    }
  } finally {
    if (ownsProjectRoot) {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationProviderFleetSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
