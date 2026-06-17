import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createInMemoryMcpPlusProfileStore,
  praxis,
  type BaseToolExecutorPort,
  type RuntimeOfficialAdapterReport,
} from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationMcpPlusSmokeResult = {
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
  providerToolExposure: {
    firstCallExposesInit: boolean;
    secondCallExposesInit: boolean;
    secondCallExposesPinnedTool: boolean;
    exposedProviderNamesByCall: readonly (readonly string[])[];
  };
  providerRoundTrip: {
    initOutputFedBack: boolean;
    dynamicToolOutputFedBack: boolean;
    dynamicToolOutputIncludesCallResult: boolean;
    callIds: readonly string[];
  };
  mcpAdapter: {
    listToolsCalls: number;
    callCalls: number;
    calledServerId: string | undefined;
    calledToolName: string | undefined;
  };
  profileStore: {
    profileSaved: boolean;
    schemaVersion: string | undefined;
    pinnedTools: readonly string[];
    indexedTools: readonly string[];
  };
  toolEvents: {
    completedToolIds: readonly string[];
    familyKeys: readonly string[];
  };
  officialAdapterReport: {
    kind: RuntimeOfficialAdapterReport["kind"];
    status: RuntimeOfficialAdapterReport["status"];
    sourceKind: RuntimeOfficialAdapterReport["sourceKind"];
    coverage: RuntimeOfficialAdapterReport["coverage"];
    mcpPlus: {
      status: RuntimeOfficialAdapterReport["mcpPlus"]["status"];
      serverId: string | undefined;
      secondCallHidesInit: boolean | undefined;
      profileSaved: boolean | undefined;
      dynamicToolIds: readonly string[];
      pinnedTools: readonly string[];
      indexedTools: readonly string[];
      calledToolName: string | undefined;
    };
    index: {
      totalAdapters: number;
      providerToolNames: readonly string[];
      mcpPlusDynamicToolIds: readonly string[];
    };
    query: {
      returnedAdapters: number;
      refs: readonly string[];
    };
    publicSafe: true;
  };
  events: readonly string[];
};

export type RuntimeApplicationMcpPlusSmokeInput = {
  now?: () => string;
};

const initCallId = "application-mcp-plus-init";
const browserOpenCallId = "application-mcp-plus-browser-open";
const serverId = "browser-plus";
const browserOpenToolId = "mcp.browser-plus.browser.open";
const initToolId = "mcp.browser-plus.mcp_plus.init";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-mcp-plus-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-mcp-plus-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application MCP+ smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-mcp-plus-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-mcp-plus-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function providerToolNames(body: unknown): readonly string[] {
  const tools = record(body).tools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map((item) => record(item))
    .map((item) => stringValue(item.name) ?? stringValue(record(item.function).name))
    .filter((name): name is string => name !== undefined);
}

function providerInput(body: unknown): readonly Readonly<Record<string, unknown>>[] {
  const input = record(body).input;
  return Array.isArray(input) ? input.map((item) => record(item)) : [];
}

function findToolOutput(body: unknown, callId: string): string | undefined {
  const item = providerInput(body).find((entry) =>
    entry.type === "function_call_output" && entry.call_id === callId
  );
  return typeof item?.output === "string" ? item.output : undefined;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationMcpPlusSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationMcpPlusSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationMcpPlusSmoke",
  });
  toolPolicy = praxis.toolPolicies.bapr({
    matrixId: "toolPolicy.example.applicationMcpPlusSmoke.bapr",
  });
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "full",
  });
  harness = praxis.harness({
    tools: praxis.mcp.recommendedTools(),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:call", "mcp:resource:list", "mcp:prompt:list", "mcp:prompt:get"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 3,
      maxToolCalls: 2,
    }),
  });
}

export default ApplicationMcpPlusSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-mcp-plus-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationMcpPlusSmokeAgent",
    application: { id: "application.mcp-plus-smoke" },
    agent: { id: "agent.example.applicationMcpPlusSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationMcpPlusSmoke(
  input: RuntimeApplicationMcpPlusSmokeInput = {},
): Promise<RuntimeApplicationMcpPlusSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-mcp-plus-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let listToolsCalls = 0;
    let callCalls = 0;
    let calledServerId: string | undefined;
    let calledToolName: string | undefined;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const profileStore = createInMemoryMcpPlusProfileStore();
    const mcpAdapter: Partial<BaseToolExecutorPort> = {
      mcp: {
        listTools: async (request) => {
          listToolsCalls += 1;
          return {
            ok: true,
            output: {
              serverId: request?.serverId,
              tools: [
                {
                  name: "browser.open",
                  description: "Open a browser page.",
                  inputSchema: {
                    type: "object",
                    properties: { url: { type: "string" } },
                    required: ["url"],
                  },
                },
                {
                  name: "network.status",
                  description: "Inspect network requests.",
                  inputSchema: { type: "object", properties: {} },
                },
              ],
            },
          };
        },
        call: async (request) => {
          callCalls += 1;
          calledServerId = request?.serverId;
          calledToolName = request?.toolName;
          return {
            ok: true,
            output: {
              result: "application-mcp-plus-call-ok",
              serverId: request?.serverId,
              toolName: request?.toolName,
              arguments: request?.arguments,
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
      baseToolAdapters: mcpAdapter,
      mcpServers: [{
        serverId,
        transport: "stdio",
        command: "node",
        args: ["browser-plus-server.js"],
        mode: "mcp-plus",
      }],
      mcpPlus: {
        projectId: "project.application.mcpPlusSmoke",
        profileStore,
      },
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          const toolNames = providerToolNames(envelope.body);
          const initToolName = toolNames.find((name) => name.includes("mcp_plus_init"));
          const browserOpenToolName = toolNames.find((name) => name.includes("mcp_browser-plus_browser_open"));
          if (providerCalls === 1) {
            if (initToolName === undefined) throw new Error("MCP+ init tool was not exposed to the first provider call.");
            return {
              output: [{
                type: "function_call",
                name: initToolName,
                call_id: initCallId,
                arguments: JSON.stringify({
                  serverId,
                  pinnedTools: ["browser.open"],
                  indexedTools: ["network.status"],
                  toolCards: {
                    "network.status": {
                      title: "Network status",
                      summary: "Inspect network requests when a browser page misbehaves.",
                      keywords: ["network", "browser"],
                    },
                  },
                  rationale: {
                    summary: "browser.open is the canonical first visible tool for this application smoke.",
                  },
                }),
              }],
            };
          }
          if (providerCalls === 2) {
            if (initToolName !== undefined) throw new Error("MCP+ init tool should be hidden after profile initialization.");
            if (browserOpenToolName === undefined) throw new Error("MCP+ pinned dynamic tool was not exposed after profile initialization.");
            return {
              output: [{
                type: "function_call",
                name: browserOpenToolName,
                call_id: browserOpenCallId,
                arguments: JSON.stringify({
                  url: "https://example.com/application-mcp-plus-smoke",
                }),
              }],
            };
          }
          return { output_text: "application MCP+ smoke completed" };
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
          text: "Initialize the browser MCP+ profile and open a page with the refreshed tool.",
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const namesByCall = providerBodies.map(providerToolNames);
      const initOutput = findToolOutput(providerBodies[1], initCallId);
      const dynamicToolOutput = findToolOutput(providerBodies[2], browserOpenCallId);
      const profile = await profileStore.load({
        projectId: "project.application.mcpPlusSmoke",
        serverId,
      });
      const completedToolEvents = events.filter((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolStatus === "completed";
      });
      const toolEvents = {
        completedToolIds: completedToolEvents
          .map((event) => stringValue(record(event.metadata).toolId))
          .filter((toolId): toolId is string => toolId !== undefined),
        familyKeys: completedToolEvents
          .map((event) => stringValue(record(event.metadata).familyKey))
          .filter((familyKey): familyKey is string => familyKey !== undefined),
      };
      const providerRoundTrip = {
        initOutputFedBack: initOutput !== undefined,
        dynamicToolOutputFedBack: dynamicToolOutput !== undefined,
        dynamicToolOutputIncludesCallResult: dynamicToolOutput?.includes("application-mcp-plus-call-ok") ?? false,
        callIds: [
          initOutput === undefined ? undefined : initCallId,
          dynamicToolOutput === undefined ? undefined : browserOpenCallId,
        ].filter((callId): callId is string => callId !== undefined),
      };
      const providerToolExposure = {
        firstCallExposesInit: namesByCall[0]?.some((name) => name.includes("mcp_plus_init")) ?? false,
        secondCallExposesInit: namesByCall[1]?.some((name) => name.includes("mcp_plus_init")) ?? false,
        secondCallExposesPinnedTool: namesByCall[1]?.some((name) => name.includes("mcp_browser-plus_browser_open")) ?? false,
        exposedProviderNamesByCall: namesByCall,
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      const officialAdapterReport = praxis.runtime.createRuntimeOfficialAdapterReport({
        sourceKind: "application-events",
        adapters: [{
          familyKey: "mcpPlus",
          toolId: initToolId,
          toolStatus: toolEvents.completedToolIds.includes(initToolId) ? "completed" : undefined,
          providerToolExposed: providerToolExposure.firstCallExposesInit,
          exposedProviderNames: namesByCall[0] ?? [],
          adapterCalls: listToolsCalls,
          callId: providerRoundTrip.callIds[0],
          outputFedBack: providerRoundTrip.initOutputFedBack,
          outputIncludesEvidence: profile !== undefined,
          serverId,
          calledToolName: "mcp_plus.init",
        }, {
          familyKey: "mcpPlus",
          toolId: browserOpenToolId,
          toolStatus: toolEvents.completedToolIds.includes(browserOpenToolId) ? "completed" : undefined,
          providerToolExposed: providerToolExposure.secondCallExposesPinnedTool,
          exposedProviderNames: namesByCall[1] ?? [],
          adapterCalls: callCalls,
          callId: providerRoundTrip.callIds[1],
          outputFedBack: providerRoundTrip.dynamicToolOutputFedBack,
          outputIncludesEvidence: providerRoundTrip.dynamicToolOutputIncludesCallResult,
          serverId: calledServerId,
          calledToolName,
        }],
        mcpPlus: {
          serverId,
          initToolId,
          dynamicToolIds: [browserOpenToolId],
          firstCallExposesInit: providerToolExposure.firstCallExposesInit,
          secondCallExposesInit: providerToolExposure.secondCallExposesInit,
          secondCallExposesPinnedTool: providerToolExposure.secondCallExposesPinnedTool,
          exposedProviderNamesByCall: providerToolExposure.exposedProviderNamesByCall,
          profileSaved: profile !== undefined,
          schemaVersion: profile?.schemaVersion,
          pinnedTools: profile?.exposure.pinnedTools ?? [],
          indexedTools: profile?.exposure.indexedTools ?? [],
          listToolsCalls,
          callCalls,
          calledServerId,
          calledToolName,
          callIds: providerRoundTrip.callIds,
          initOutputFedBack: providerRoundTrip.initOutputFedBack,
          dynamicToolOutputFedBack: providerRoundTrip.dynamicToolOutputFedBack,
          dynamicToolOutputIncludesCallResult: providerRoundTrip.dynamicToolOutputIncludesCallResult,
        },
        composition: {
          callOrder: [initToolId, browserOpenToolId],
          expectedCallOrder: [initToolId, browserOpenToolId],
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
        query: { familyKey: "mcpPlus" },
      });
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application MCP+ smoke completed" &&
          view.counters.toolCalls === 2 &&
          providerCalls === 3 &&
          listToolsCalls >= 1 &&
          callCalls === 1 &&
          calledServerId === serverId &&
          calledToolName === "browser.open" &&
          profile?.schemaVersion === "mcp-plus.profile.v1" &&
          stringArrayValue(profile.exposure.pinnedTools).includes("browser.open") &&
          stringArrayValue(profile.exposure.indexedTools).includes("network.status") &&
          providerToolExposure.firstCallExposesInit &&
          !providerToolExposure.secondCallExposesInit &&
          providerToolExposure.secondCallExposesPinnedTool &&
          providerRoundTrip.initOutputFedBack &&
          providerRoundTrip.dynamicToolOutputFedBack &&
          providerRoundTrip.dynamicToolOutputIncludesCallResult &&
          toolEvents.completedToolIds.join(",") === `${initToolId},${browserOpenToolId}` &&
          eventNames.includes("final") &&
          officialAdapterReport.status === "ok" &&
          officialAdapterReport.coverage.hasMcpPlusProfileRefresh &&
          officialAdapterReport.coverage.hasMcpPlusDynamicTool &&
          officialAdapterReport.mcpPlus.exposure.secondCallHidesInit === true &&
          officialAdapterQuery.returnedAdapters === 2
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
        providerToolExposure,
        providerRoundTrip,
        mcpAdapter: {
          listToolsCalls,
          callCalls,
          calledServerId,
          calledToolName,
        },
        profileStore: {
          profileSaved: profile !== undefined,
          schemaVersion: profile?.schemaVersion,
          pinnedTools: profile?.exposure.pinnedTools ?? [],
          indexedTools: profile?.exposure.indexedTools ?? [],
        },
        toolEvents,
        officialAdapterReport: {
          kind: officialAdapterReport.kind,
          status: officialAdapterReport.status,
          sourceKind: officialAdapterReport.sourceKind,
          coverage: officialAdapterReport.coverage,
          mcpPlus: {
            status: officialAdapterReport.mcpPlus.status,
            serverId: officialAdapterReport.mcpPlus.serverId,
            secondCallHidesInit: officialAdapterReport.mcpPlus.exposure.secondCallHidesInit,
            profileSaved: officialAdapterReport.mcpPlus.profile.profileSaved,
            dynamicToolIds: officialAdapterReport.mcpPlus.dynamicToolIds,
            pinnedTools: officialAdapterReport.mcpPlus.profile.pinnedTools,
            indexedTools: officialAdapterReport.mcpPlus.profile.indexedTools,
            calledToolName: officialAdapterReport.mcpPlus.adapter.calledToolName,
          },
          index: {
            totalAdapters: officialAdapterIndex.totalAdapters,
            providerToolNames: officialAdapterIndex.providerToolNames,
            mcpPlusDynamicToolIds: officialAdapterIndex.mcpPlusDynamicToolIds,
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
  const result = await runApplicationMcpPlusSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
