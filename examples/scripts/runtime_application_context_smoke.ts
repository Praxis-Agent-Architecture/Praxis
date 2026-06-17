import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis, type BaseToolExecutorPort, type RuntimeOfficialAdapterReport } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationContextSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
  };
  providerCalls: number;
  adapter: {
    calls: number;
    kind: string | undefined;
    query: string | undefined;
    ref: string | undefined;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesContextMaterial: boolean;
    secondProviderInputItems: number;
  };
  providerToolExposure: {
    expectedProviderName: string;
    exposesExpectedTool: boolean;
    exposedProviderNames: readonly string[];
    toolCount: number;
  };
  toolEvent: {
    toolId: string | undefined;
    toolStatus: string | undefined;
    contextKind: string | undefined;
    familyKey: string | undefined;
    itemCount: number | undefined;
    humanResultSummary: readonly string[];
  };
  officialAdapterReport: {
    kind: RuntimeOfficialAdapterReport["kind"];
    status: RuntimeOfficialAdapterReport["status"];
    sourceKind: RuntimeOfficialAdapterReport["sourceKind"];
    coverage: RuntimeOfficialAdapterReport["coverage"];
    index: {
      totalAdapters: number;
      byFamilyKey: Readonly<Record<string, number>>;
      byToolId: Readonly<Record<string, number>>;
      byStatus: Readonly<Record<string, number>>;
      completedToolIds: readonly string[];
    };
    query: {
      returnedAdapters: number;
      refs: readonly string[];
    };
    publicSafe: true;
  };
  events: readonly string[];
};

export type RuntimeApplicationContextSmokeInput = {
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

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationContextSmokeResult["providerToolExposure"] {
  const bodyTools = record(body).tools;
  const tools: unknown[] = Array.isArray(bodyTools) ? bodyTools : [];
  const exposedProviderNames = tools
    .map((item) => record(item))
    .map((item) => stringValue(item.name) ?? stringValue(record(item.function).name))
    .filter((name): name is string => name !== undefined);
  return {
    expectedProviderName,
    exposesExpectedTool: exposedProviderNames.includes(expectedProviderName),
    exposedProviderNames,
    toolCount: exposedProviderNames.length,
  };
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-context-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-context-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application context smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-context-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-context-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationContextSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationContextSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationContextSmoke",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationContextSmoke.yolo",
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.basetool.extension.contextLoad({ profileName: "agentCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "context:read", "artifact:read"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationContextSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-context-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationContextSmokeAgent",
    application: { id: "application.context-smoke" },
    agent: { id: "agent.example.applicationContextSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationContextSmoke(
  input: RuntimeApplicationContextSmokeInput = {},
): Promise<RuntimeApplicationContextSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-context-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let adapterCalls = 0;
    let adapterKind: string | undefined;
    let adapterQuery: string | undefined;
    let adapterRef: string | undefined;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const contextAdapters: Partial<BaseToolExecutorPort> = {
      context: {
        load: async (request) => {
          adapterCalls += 1;
          adapterKind = stringValue(record(request).kind);
          adapterQuery = stringValue(record(request).query);
          adapterRef = stringValue(record(request).ref);
          return {
            ok: true,
            output: {
              kind: adapterKind,
              query: adapterQuery,
              ref: adapterRef,
              summary: "Application-owned context adapter returned workspace index material.",
              items: [{
                id: "application-context-ok",
                title: "Application Context Runtime Mount",
                text: "application-context-ok",
                source: "workspaceIndex",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_context_smoke",
              adapterMountedBy: "application",
            },
          };
        },
      },
    };
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "agentCore",
      baseToolAdapters: contextAdapters,
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          if (providerCalls === 1) {
            return {
              output: [{
                type: "function_call",
                name: "context.load",
                call_id: "application-context-smoke-call",
                arguments: JSON.stringify({
                  kind: "workspaceIndex",
                  query: "runtime application context",
                  limit: 1,
                }),
              }],
            };
          }
          return { output_text: "application context smoke completed" };
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
      const result = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "Load application workspace index context.",
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "context.load" && metadata.toolStatus === "completed";
      });
      const toolMetadata = record(completedToolEvent?.metadata);
      const resultMetadata = record(toolMetadata.resultMetadata);
      const secondProviderBody = record(providerBodies[1]);
      const secondProviderInput = Array.isArray(secondProviderBody.input) ? secondProviderBody.input : [];
      const toolResultInput = secondProviderInput
        .map((item) => record(item))
        .find((item) => item.type === "function_call_output");
      const toolResultOutput = typeof toolResultInput?.output === "string" ? toolResultInput.output : "";
      const providerRoundTrip = {
        toolOutputFedBack: toolResultInput !== undefined,
        callId: stringValue(toolResultInput?.call_id),
        outputIncludesContextMaterial: toolResultOutput.includes("application-context-ok"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_context_load");
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        contextKind: stringValue(resultMetadata.contextKind),
        familyKey: stringValue(toolMetadata.familyKey),
        itemCount: numberValue(resultMetadata.itemCount),
        humanResultSummary: stringArrayValue(toolMetadata.humanResultSummary),
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      const officialAdapterReport = praxis.runtime.createRuntimeOfficialAdapterReport({
        sourceKind: "application-events",
        adapters: [{
          familyKey: "context",
          toolId: toolEvent.toolId,
          toolStatus: toolEvent.toolStatus,
          expectedProviderName: toolExposure.expectedProviderName,
          providerToolExposed: toolExposure.exposesExpectedTool,
          exposedProviderNames: toolExposure.exposedProviderNames,
          adapterCalls,
          callId: providerRoundTrip.callId,
          outputFedBack: providerRoundTrip.toolOutputFedBack,
          outputIncludesEvidence: providerRoundTrip.outputIncludesContextMaterial,
          resultKind: toolEvent.contextKind,
          itemCount: toolEvent.itemCount,
          humanResultSummary: toolEvent.humanResultSummary.join(" "),
        }],
        composition: {
          callOrder: ["context.load"],
          expectedCallOrder: ["context.load"],
          providerCalls,
          toolCalls: view.counters.toolCalls,
          finalEventSeen: eventNames.includes("final"),
          finalOutput: view.finalOutput,
        },
        applicationEvents: events,
      });
      const officialAdapterIndex = praxis.runtime.createRuntimeOfficialAdapterIndex(officialAdapterReport);
      const officialAdapterQuery = praxis.runtime.queryRuntimeOfficialAdapters({
        report: officialAdapterReport,
        query: { familyKey: "context", toolId: "context.load" },
      });
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application context smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          adapterCalls === 1 &&
          adapterKind === "workspaceIndex" &&
          adapterQuery === "runtime application context" &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-context-smoke-call" &&
          providerRoundTrip.outputIncludesContextMaterial &&
          toolExposure.exposesExpectedTool &&
          toolEvent.toolId === "context.load" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.contextKind === "workspaceIndex" &&
          toolEvent.familyKey === "context" &&
          toolEvent.itemCount === 1 &&
          eventNames.includes("tool:context.load:completed") &&
          eventNames.includes("final") &&
          officialAdapterReport.status === "ok" &&
          officialAdapterReport.coverage.hasProviderToolExposure &&
          officialAdapterReport.coverage.hasProviderRoundTrip &&
          officialAdapterReport.coverage.hasCompletedToolEvents &&
          officialAdapterQuery.returnedAdapters === 1
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          status: view.status,
          finalOutput: view.finalOutput,
          counters: view.counters,
        },
        providerCalls,
        adapter: {
          calls: adapterCalls,
          kind: adapterKind,
          query: adapterQuery,
          ref: adapterRef,
        },
        providerRoundTrip,
        providerToolExposure: toolExposure,
        toolEvent,
        officialAdapterReport: {
          kind: officialAdapterReport.kind,
          status: officialAdapterReport.status,
          sourceKind: officialAdapterReport.sourceKind,
          coverage: officialAdapterReport.coverage,
          index: {
            totalAdapters: officialAdapterIndex.totalAdapters,
            byFamilyKey: officialAdapterIndex.byFamilyKey,
            byToolId: officialAdapterIndex.byToolId,
            byStatus: officialAdapterIndex.byStatus,
            completedToolIds: officialAdapterIndex.completedToolIds,
          },
          query: {
            returnedAdapters: officialAdapterQuery.returnedAdapters,
            refs: officialAdapterQuery.refs,
          },
          publicSafe: officialAdapterReport.publicSafe,
        },
        events: eventNames,
      };
    } finally {
      unsubscribe();
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runApplicationContextSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
