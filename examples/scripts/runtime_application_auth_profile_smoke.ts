import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationAuthProfileSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  providerCalls: number;
  authSelections: readonly unknown[];
  providerRequest: {
    endpoint: string | undefined;
    url: string | undefined;
    authorizationHeaderPresent: boolean;
    privateAuthMaterialReachedProviderCaller: boolean;
    promptCacheKeyPresent: boolean;
  };
  view: {
    status: PraxisApplicationViewModel["status"];
    counters: PraxisApplicationViewModel["counters"];
    finalOutput: string | undefined;
    usage: PraxisApplicationViewModel["usage"];
  };
  publicSafety: {
    viewContainsSecret: boolean;
    eventsContainSecret: boolean;
    resolverResultContainsSecret: boolean;
  };
  events: readonly string[];
};

export type RuntimeApplicationAuthProfileSmokeInput = {
  now?: () => string;
  projectRoot?: string;
};

const RAW_SECRET = "sk-application-auth-profile-secret";
const MASTER_KEY = "application-auth-profile-master-key";
const PROVIDER_PROFILE_REF = "profile.example.applicationAuthProfile.responses";
const MODEL_ENTRY_REF = "model.example.applicationAuthProfile.gpt-5.5";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "model") return event.kind;
  const metadata = record(event.metadata);
  return `model:${String(metadata.modelPhase ?? "unknown")}`;
}

function includesRawSecret(value: unknown): boolean {
  return JSON.stringify(value).includes(RAW_SECRET);
}

function viewSummary(view: PraxisApplicationViewModel): RuntimeApplicationAuthProfileSmokeResult["view"] {
  return {
    status: view.status,
    counters: view.counters,
    finalOutput: view.finalOutput,
    usage: view.usage,
  };
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationAuthProfileSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationAuthProfile";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationAuthProfile.responses",
    providerProfileRef: "${PROVIDER_PROFILE_REF}",
    modelEntryRef: "${MODEL_ENTRY_REF}",
    metadata: { providerRoute: "openai_responses" },
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

export default ApplicationAuthProfileSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-auth-profile-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationAuthProfileSmokeAgent",
    application: { id: "application.auth-profile-smoke" },
    agent: { id: "agent.example.applicationAuthProfile" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

async function createResolver(now: () => string) {
  const secret = await praxis.auth.createSecret({
    secretId: "secret.example.applicationAuthProfile.responses",
    provider: "openai",
    secretKind: "api_key",
    plaintext: { apiKey: RAW_SECRET },
    keyProvider: () => MASTER_KEY,
    now: now(),
  });
  if (!secret.ok) throw new Error(secret.error.message);
  const credentialRef = praxis.auth.credentialRef({
    credentialRefId: "credential.example.applicationAuthProfile.responses",
    secretId: secret.value.secretId,
    provider: "openai",
    credentialType: "openai_api_key",
    secretKind: "api_key",
    publicSafe: true,
  });
  const profile = praxis.auth.profile({
    profileId: PROVIDER_PROFILE_REF,
    provider: "openai",
    endpointShape: "responses",
    baseURL: "https://gateway.auth-profile.test",
    credentialRef,
    now: now(),
  });
  const modelEntry = praxis.auth.modelEntry({
    modelEntryId: MODEL_ENTRY_REF,
    providerProfileRef: PROVIDER_PROFILE_REF,
    model: "gpt-5.5",
  });
  if (!profile.ok) throw new Error(profile.error.message);
  if (!modelEntry.ok) throw new Error(modelEntry.error.message);
  return praxis.auth.resolver({
    registry: praxis.auth.registry({
      profiles: [profile.value],
      modelEntries: [modelEntry.value],
    }),
    vault: praxis.auth.vault([secret.value]),
    keyProvider: () => MASTER_KEY,
    now,
  });
}

export async function runApplicationAuthProfileSmoke(
  input: RuntimeApplicationAuthProfileSmokeInput = {},
): Promise<RuntimeApplicationAuthProfileSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-auth-profile-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const resolver = await createResolver(now);
    const events: PraxisApplicationEvent[] = [];
    const authSelections: unknown[] = [];
    const resolverPublicResults: unknown[] = [];
    const providerRequests: unknown[] = [];
    const runtimeAuthResolver = {
      resolve: async (request: Parameters<typeof resolver.resolve>[0]) => {
        authSelections.push(request);
        const resolved = await resolver.resolve(request);
        if (resolved.ok) {
          resolverPublicResults.push({
            providerProfile: resolved.value.providerProfile,
            modelEntry: resolved.value.modelEntry,
            credentialRef: resolved.value.credentialRef,
            auth: resolved.value.auth,
          });
        } else {
          resolverPublicResults.push(resolved);
        }
        return resolved;
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
          return {
            id: "resp_application_auth_profile",
            output_text: "application auth profile handoff ok",
            usage: {
              input_tokens: 55,
              output_tokens: 7,
              total_tokens: 62,
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
          text: "Use the manifest-declared runtime auth profile.",
          cwd: projectRoot,
        },
      });
      const view = created.runtime.getView();
      const request = record(providerRequests[0]);
      const body = record(request.body);
      const authorization = stringValue(record(request.headers).authorization);
      const status =
        providerRequests.length === 1 &&
        view.finalOutput === "application auth profile handoff ok" &&
        authSelections.length === 1 &&
        authorization === `Bearer ${RAW_SECRET}`
          ? "ok"
          : "failed";
      return {
        status,
        startedAt,
        finishedAt: now(),
        projectRoot,
        providerCalls: providerRequests.length,
        authSelections,
        providerRequest: {
          endpoint: stringValue(request.endpoint),
          url: stringValue(request.url),
          authorizationHeaderPresent: authorization !== undefined,
          privateAuthMaterialReachedProviderCaller: authorization === `Bearer ${RAW_SECRET}`,
          promptCacheKeyPresent: stringValue(body.prompt_cache_key) !== undefined,
        },
        view: viewSummary(view),
        publicSafety: {
          viewContainsSecret: includesRawSecret(view),
          eventsContainSecret: includesRawSecret(events),
          resolverResultContainsSecret: includesRawSecret(resolverPublicResults),
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
  const result = await runApplicationAuthProfileSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") {
    process.exitCode = 1;
  }
}
