import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationProviderProbeSmokeResult = {
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
  probe: {
    primarySkipped: boolean;
    fallbackPreselected: boolean;
    eventCapabilitySelection: boolean;
    eventAdaptiveSelection: boolean;
    eventRequiredCapabilities: readonly string[];
    primaryFailedEvents: number;
    modelCompletedEvents: number;
  };
  publicSafety: {
    viewContainsSecret: boolean;
    eventsContainSecret: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationProviderProbeSmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

const RAW_PRIMARY_SECRET = "sk-application-provider-probe-primary";
const RAW_FALLBACK_SECRET = "sk-application-provider-probe-fallback";
const MASTER_KEY = "application-provider-probe-master-key";
const PRIMARY_PROFILE_REF = "profile.example.applicationProviderProbe.primary";
const FALLBACK_PROFILE_REF = "profile.example.applicationProviderProbe.fallback";
const PRIMARY_MODEL_ENTRY_REF = "model.example.applicationProviderProbe.primary";
const FALLBACK_MODEL_ENTRY_REF = "model.example.applicationProviderProbe.fallback";

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

function completedModelEventMetadata(events: readonly PraxisApplicationEvent[]): Readonly<Record<string, unknown>> {
  const completed = events.find((event) =>
    event.kind === "model" &&
    record(event.metadata).modelPhase === "completed"
  );
  return record(completed?.metadata);
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationProviderProbeSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationProviderProbe";
  model = praxis.model("gpt-5.5-probe-primary", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationProviderProbe.primary",
    providerProfileRef: "${PRIMARY_PROFILE_REF}",
    modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
    metadata: { providerRoute: "openai_responses" },
  });
  modelFleet = praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-probe-primary",
      carrierId: "carrier.example.applicationProviderProbe.primary",
      providerProfileRef: "${PRIMARY_PROFILE_REF}",
      modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
      probe: {
        status: "unavailable",
        checkedAt: "2026-06-08T00:00:00.000Z",
        errorCode: "PROVIDER_UNAVAILABLE",
        publicSafeMessage: "primary probe is unavailable",
      },
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
      model: "gpt-5.5-probe-fallback",
      carrierId: "carrier.example.applicationProviderProbe.fallback",
      providerProfileRef: "${FALLBACK_PROFILE_REF}",
      modelEntryRef: "${FALLBACK_MODEL_ENTRY_REF}",
      probe: {
        status: "available",
        checkedAt: "2026-06-08T00:00:00.000Z",
        latencyMs: 25,
        publicSafeMessage: "fallback probe is available",
      },
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
    modelFleetRef: "modelFleet.example.applicationProviderProbe",
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

export default ApplicationProviderProbeSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-provider-probe-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationProviderProbeSmokeAgent",
    application: { id: "application.provider-probe-smoke" },
    agent: { id: "agent.example.applicationProviderProbe" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function createResolver(now: () => string) {
  const primarySecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderProbe.primary",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_PRIMARY_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  const fallbackSecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderProbe.fallback",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_FALLBACK_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  if (!primarySecret.ok) throw new Error(primarySecret.error.message);
  if (!fallbackSecret.ok) throw new Error(fallbackSecret.error.message);

  const primaryCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderProbe.primary",
    secretId: primarySecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const fallbackCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderProbe.fallback",
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
    baseURL: "https://primary.provider-probe.test",
    credentialRef: primaryCredential,
    now: now(),
  });
  const fallbackProfile = praxis.auth.profile({
    profileId: FALLBACK_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://fallback.provider-probe.test",
    credentialRef: fallbackCredential,
    now: now(),
  });
  const primaryModel = praxis.auth.modelEntry({
    modelEntryId: PRIMARY_MODEL_ENTRY_REF,
    providerProfileRef: PRIMARY_PROFILE_REF,
    model: "gpt-5.5-probe-primary",
  });
  const fallbackModel = praxis.auth.modelEntry({
    modelEntryId: FALLBACK_MODEL_ENTRY_REF,
    providerProfileRef: FALLBACK_PROFILE_REF,
    model: "gpt-5.5-probe-fallback",
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

function viewSummary(view: PraxisApplicationViewModel): RuntimeApplicationProviderProbeSmokeResult["view"] {
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
  if (invocationId.includes("fallback")) return "carrier.example.applicationProviderProbe.fallback";
  if (record(record(request).body).model === "gpt-5.5-probe-fallback") return "carrier.example.applicationProviderProbe.fallback";
  return "carrier.example.applicationProviderProbe.primary";
}

export async function runApplicationProviderProbeSmoke(
  input: RuntimeApplicationProviderProbeSmokeInput = {},
): Promise<RuntimeApplicationProviderProbeSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-provider-probe-smoke-"));
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
          if (record(request.body).model === "gpt-5.5-probe-primary") {
            throw Object.assign(new Error("primary endpoint should be skipped by probe preselection"), { status: 503 });
          }
          return {
            id: "resp_application_provider_probe",
            output_text: "application provider probe fallback ok",
            usage: {
              input_tokens: 62,
              output_tokens: 8,
              total_tokens: 70,
              input_tokens_details: { cached_tokens: 19 },
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
          text: "Use the manifest-declared provider probe state and select the available fallback.",
          cwd: projectRoot,
        },
      });
      const view = created.runtime.getView();
      const callOrder = providerRequests.map(carrierIdFromRequest);
      const primarySkipped = !callOrder.includes("carrier.example.applicationProviderProbe.primary");
      const fallbackPreselected = callOrder[0] === "carrier.example.applicationProviderProbe.fallback";
      const modelEventMetadata = completedModelEventMetadata(events);
      const eventCapabilitySelection = booleanValue(modelEventMetadata.modelFleetCapabilitySelection);
      const eventAdaptiveSelection = booleanValue(modelEventMetadata.modelFleetAdaptiveSelection);
      const eventRequiredCapabilities = stringArray(modelEventMetadata.modelFleetRequiredCapabilities);
      const status = providerRequests.length === 1 &&
        primarySkipped &&
        fallbackPreselected &&
        eventAdaptiveSelection &&
        eventRequiredCapabilities.includes("toolCalling") &&
        view.finalOutput === "application provider probe fallback ok"
        ? "ok"
        : "failed";
      return {
        status,
        startedAt,
        finishedAt: now(),
        projectRoot,
        providerCalls: providerRequests.length,
        callOrder,
        authSelections,
        view: viewSummary(view),
        probe: {
          primarySkipped,
          fallbackPreselected,
          eventCapabilitySelection,
          eventAdaptiveSelection,
          eventRequiredCapabilities,
          primaryFailedEvents: modelPhaseCount(events, "failed"),
          modelCompletedEvents: modelPhaseCount(events, "completed"),
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
  const result = await runApplicationProviderProbeSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
