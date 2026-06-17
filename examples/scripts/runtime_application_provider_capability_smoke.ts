import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationProviderCapabilitySmokeResult = {
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
  capability: {
    primarySkipped: boolean;
    toolCapableSelected: boolean;
    providerToolsExposed: boolean;
    providerToolCounts: readonly number[];
    eventCapabilitySelection: boolean;
    eventAdaptiveSelection: boolean;
    eventRequiredCapabilities: readonly string[];
    modelFailedEvents: number;
    modelCompletedEvents: number;
  };
  publicSafety: {
    viewContainsSecret: boolean;
    eventsContainSecret: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationProviderCapabilitySmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

const RAW_PRIMARY_SECRET = "sk-application-provider-capability-primary";
const RAW_TOOL_CAPABLE_SECRET = "sk-application-provider-capability-tool-capable";
const MASTER_KEY = "application-provider-capability-master-key";
const PRIMARY_PROFILE_REF = "profile.example.applicationProviderCapability.primary";
const TOOL_CAPABLE_PROFILE_REF = "profile.example.applicationProviderCapability.toolCapable";
const PRIMARY_MODEL_ENTRY_REF = "model.example.applicationProviderCapability.primary";
const TOOL_CAPABLE_MODEL_ENTRY_REF = "model.example.applicationProviderCapability.toolCapable";

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
  return text.includes(RAW_PRIMARY_SECRET) || text.includes(RAW_TOOL_CAPABLE_SECRET);
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

export class ApplicationProviderCapabilitySmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationProviderCapability";
  model = praxis.model("gpt-5.5-no-tools", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationProviderCapability.primary",
    providerProfileRef: "${PRIMARY_PROFILE_REF}",
    modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
    metadata: { providerRoute: "openai_responses" },
  });
  modelFleet = praxis.modelFleet.auto({
    primary: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-no-tools",
      carrierId: "carrier.example.applicationProviderCapability.primary",
      providerProfileRef: "${PRIMARY_PROFILE_REF}",
      modelEntryRef: "${PRIMARY_MODEL_ENTRY_REF}",
      capabilityMatrix: { text: true, toolCalling: false },
      failurePolicy: { onUnavailable: "fail", maxRetries: 0 },
      metadata: { providerRoute: "openai_responses" },
    }),
    toolCapable: praxis.endpoint("/v1/responses", {
      role: "reasoning",
      provider: "openai",
      model: "gpt-5.5-tool-capable",
      carrierId: "carrier.example.applicationProviderCapability.toolCapable",
      providerProfileRef: "${TOOL_CAPABLE_PROFILE_REF}",
      modelEntryRef: "${TOOL_CAPABLE_MODEL_ENTRY_REF}",
      capabilityMatrix: { text: true, toolCalling: true },
      failurePolicy: { onUnavailable: "fail", maxRetries: 0 },
      metadata: { providerRoute: "openai_responses" },
    }),
  }, {
    primaryRef: "primary",
    failurePolicy: { onUnavailable: "fail", maxRetries: 0 },
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    modelFleetRef: "modelFleet.example.applicationProviderCapability",
    tools: praxis.tools([praxis.tool("file.read")]),
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

export default ApplicationProviderCapabilitySmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-provider-capability-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationProviderCapabilitySmokeAgent",
    application: { id: "application.provider-capability-smoke" },
    agent: { id: "agent.example.applicationProviderCapability" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function createResolver(now: () => string) {
  const primarySecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderCapability.primary",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_PRIMARY_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  const toolCapableSecret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationProviderCapability.toolCapable",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_TOOL_CAPABLE_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  if (!primarySecret.ok) throw new Error(primarySecret.error.message);
  if (!toolCapableSecret.ok) throw new Error(toolCapableSecret.error.message);

  const primaryCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderCapability.primary",
    secretId: primarySecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const toolCapableCredential = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationProviderCapability.toolCapable",
    secretId: toolCapableSecret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const primaryProfile = praxis.auth.profile({
    profileId: PRIMARY_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://primary.provider-capability.test",
    credentialRef: primaryCredential,
    now: now(),
  });
  const toolCapableProfile = praxis.auth.profile({
    profileId: TOOL_CAPABLE_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://tool-capable.provider-capability.test",
    credentialRef: toolCapableCredential,
    now: now(),
  });
  const primaryModel = praxis.auth.modelEntry({
    modelEntryId: PRIMARY_MODEL_ENTRY_REF,
    providerProfileRef: PRIMARY_PROFILE_REF,
    model: "gpt-5.5-no-tools",
  });
  const toolCapableModel = praxis.auth.modelEntry({
    modelEntryId: TOOL_CAPABLE_MODEL_ENTRY_REF,
    providerProfileRef: TOOL_CAPABLE_PROFILE_REF,
    model: "gpt-5.5-tool-capable",
  });
  if (!primaryProfile.ok) throw new Error(primaryProfile.error.message);
  if (!toolCapableProfile.ok) throw new Error(toolCapableProfile.error.message);
  if (!primaryModel.ok) throw new Error(primaryModel.error.message);
  if (!toolCapableModel.ok) throw new Error(toolCapableModel.error.message);

  return praxis.auth.resolver({
    registry: praxis.auth.registry({
      profiles: [primaryProfile.value, toolCapableProfile.value],
      modelEntries: [primaryModel.value, toolCapableModel.value],
    }),
    vault: praxis.auth.vault([primarySecret.value, toolCapableSecret.value]),
    keyProvider: () => MASTER_KEY,
    now,
  });
}

function viewSummary(view: PraxisApplicationViewModel): RuntimeApplicationProviderCapabilitySmokeResult["view"] {
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
  if (invocationId.includes("toolCapable")) return "carrier.example.applicationProviderCapability.toolCapable";
  if (record(record(request).body).model === "gpt-5.5-tool-capable") return "carrier.example.applicationProviderCapability.toolCapable";
  return "carrier.example.applicationProviderCapability.primary";
}

function providerToolCount(request: unknown): number {
  const tools = record(request).body !== undefined
    ? record(record(request).body).tools
    : undefined;
  return Array.isArray(tools) ? tools.length : 0;
}

export async function runApplicationProviderCapabilitySmoke(
  input: RuntimeApplicationProviderCapabilitySmokeInput = {},
): Promise<RuntimeApplicationProviderCapabilitySmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-provider-capability-smoke-"));
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
          if (record(request.body).model === "gpt-5.5-no-tools") {
            throw Object.assign(new Error("primary endpoint should be skipped by capability selection"), { status: 500 });
          }
          return {
            id: "resp_application_provider_capability",
            output_text: "application provider capability ok",
            usage: {
              input_tokens: 65,
              output_tokens: 7,
              total_tokens: 72,
              input_tokens_details: { cached_tokens: 17 },
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
          text: "Use the application-declared provider fleet and select a tool-capable endpoint.",
          cwd: projectRoot,
        },
      });
      const view = created.runtime.getView();
      const callOrder = providerRequests.map(carrierIdFromRequest);
      const providerToolCounts = providerRequests.map(providerToolCount);
      const primarySkipped = !callOrder.includes("carrier.example.applicationProviderCapability.primary");
      const toolCapableSelected = callOrder[0] === "carrier.example.applicationProviderCapability.toolCapable";
      const providerToolsExposed = providerToolCounts.some((count) => count > 0);
      const modelEventMetadata = completedModelEventMetadata(events);
      const eventCapabilitySelection = booleanValue(modelEventMetadata.modelFleetCapabilitySelection);
      const eventAdaptiveSelection = booleanValue(modelEventMetadata.modelFleetAdaptiveSelection);
      const eventRequiredCapabilities = stringArray(modelEventMetadata.modelFleetRequiredCapabilities);
      const status = providerRequests.length === 1 &&
        primarySkipped &&
        toolCapableSelected &&
        providerToolsExposed &&
        eventCapabilitySelection &&
        eventRequiredCapabilities.includes("toolCalling") &&
        view.finalOutput === "application provider capability ok"
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
        capability: {
          primarySkipped,
          toolCapableSelected,
          providerToolsExposed,
          providerToolCounts,
          eventCapabilitySelection,
          eventAdaptiveSelection,
          eventRequiredCapabilities,
          modelFailedEvents: modelPhaseCount(events, "failed"),
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
  const result = await runApplicationProviderCapabilitySmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
