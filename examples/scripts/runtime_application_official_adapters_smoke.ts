import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis, type BaseToolExecutorPort, type RuntimeOfficialAdapterReport } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationOfficialAdapterMountMatrixOutput,
  type PraxisApplicationOfficialAdapterReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationOfficialAdaptersSmokeResult = {
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
    callOrder: readonly string[];
    context: {
      calls: number;
      kind: string | undefined;
      query: string | undefined;
    };
    mcp: {
      calls: number;
      serverId: string | undefined;
    };
    skill: {
      calls: number;
      requestName: string | undefined;
    };
  };
  providerRoundTrip: {
    contextOutputFedBack: boolean;
    mcpOutputFedBack: boolean;
    skillOutputFedBack: boolean;
    contextOutputIncludesMaterial: boolean;
    mcpOutputIncludesResource: boolean;
    skillOutputIncludesSummary: boolean;
    callIds: readonly string[];
    providerInputItemCounts: readonly number[];
  };
  providerToolExposure: {
    exposesContextTool: boolean;
    exposesMcpTool: boolean;
    exposesSkillTool: boolean;
    exposedProviderNames: readonly string[];
    toolCount: number;
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
    composition: {
      callOrder: readonly string[];
      expectedCallOrder: readonly string[];
      orderMatches: boolean | undefined;
    };
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
    applicationCommand: {
      kind: PraxisApplicationOfficialAdapterReportOutput["kind"];
      sessionId: string;
      runtimeId: string;
      publicSafe: true;
    };
    publicSafe: true;
  };
  officialAdapterMountMatrix: {
    kind: PraxisApplicationOfficialAdapterMountMatrixOutput["kind"];
    runtimeSurface: PraxisApplicationOfficialAdapterMountMatrixOutput["matrix"]["surface"];
    status: PraxisApplicationOfficialAdapterMountMatrixOutput["matrix"]["status"];
    toolIds: readonly string[];
    evidenceStatuses: readonly string[];
    readyAdapters: number;
    missingPorts: number;
    declaredOnlyPorts: number;
    executesAdapters: false;
    inspectedBeforeSubmitTurn: boolean;
    publicSafe: true;
  };
  events: readonly string[];
};

export type RuntimeApplicationOfficialAdaptersSmokeInput = {
  now?: () => string;
};

const contextCallId = "application-official-adapters-context-call";
const mcpCallId = "application-official-adapters-mcp-call";
const skillCallId = "application-official-adapters-skill-call";

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-official-adapters-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-official-adapters-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application official adapters smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-official-adapters-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-official-adapters-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function providerToolExposure(body: unknown): RuntimeApplicationOfficialAdaptersSmokeResult["providerToolExposure"] {
  const bodyTools = record(body).tools;
  const tools: unknown[] = Array.isArray(bodyTools) ? bodyTools : [];
  const exposedProviderNames = tools
    .map((item) => record(item))
    .map((item) => stringValue(item.name) ?? stringValue(record(item.function).name))
    .filter((name): name is string => name !== undefined);
  return {
    exposesContextTool: exposedProviderNames.includes("praxis_tool_context_load"),
    exposesMcpTool: exposedProviderNames.includes("praxis_tool_mcp_resources"),
    exposesSkillTool: exposedProviderNames.includes("praxis_tool_skill_load"),
    exposedProviderNames,
    toolCount: exposedProviderNames.length,
  };
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

export class ApplicationOfficialAdaptersSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationOfficialAdaptersSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationOfficialAdaptersSmoke",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationOfficialAdaptersSmoke.yolo",
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
      praxis.basetool.extension.mcpResources({ profileName: "agentCore" }),
      praxis.basetool.extension.skillLoad({ profileName: "agentCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: [
        "agent.invoke",
        "tool.execute",
        "context:read",
        "artifact:read",
        "mcp:resource:list",
        "skill:read",
        "filesystem:read",
      ],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 4,
      maxToolCalls: 3,
    }),
  });
}

export default ApplicationOfficialAdaptersSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-official-adapters-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationOfficialAdaptersSmokeAgent",
    application: { id: "application.official-adapters-smoke" },
    agent: { id: "agent.example.applicationOfficialAdaptersSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

function officialAdapterReportOutput(value: unknown): PraxisApplicationOfficialAdapterReportOutput {
  const output = record(value);
  if (output.kind !== "praxis.application.officialAdapterReport") {
    throw new Error("application.inspectOfficialAdapters did not return an official adapter report output.");
  }
  return value as PraxisApplicationOfficialAdapterReportOutput;
}

function officialAdapterMountMatrixOutput(value: unknown): PraxisApplicationOfficialAdapterMountMatrixOutput {
  const output = record(value);
  if (output.kind !== "praxis.application.officialAdapterMountMatrix") {
    throw new Error("application.inspectOfficialAdapterMountMatrix did not return an official adapter mount matrix output.");
  }
  return value as PraxisApplicationOfficialAdapterMountMatrixOutput;
}

export async function runApplicationOfficialAdaptersSmoke(
  input: RuntimeApplicationOfficialAdaptersSmokeInput = {},
): Promise<RuntimeApplicationOfficialAdaptersSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-official-adapters-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let contextCalls = 0;
    let mcpCalls = 0;
    let skillCalls = 0;
    let contextKind: string | undefined;
    let contextQuery: string | undefined;
    let mcpServerId: string | undefined;
    let skillRequestName: string | undefined;
    const callOrder: string[] = [];
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const adapters: Partial<BaseToolExecutorPort> = {
      context: {
        load: async (request) => {
          contextCalls += 1;
          callOrder.push("context.load");
          contextKind = stringValue(record(request).kind);
          contextQuery = stringValue(record(request).query);
          return {
            ok: true,
            output: {
              kind: contextKind,
              query: contextQuery,
              summary: "Application official adapters smoke returned context material.",
              items: [{
                id: "official-adapters-context-ok",
                title: "Official Adapters Context",
                text: "official-adapters-context-ok",
                source: "workspaceIndex",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_official_adapters_smoke",
              adapterMountedBy: "application",
            },
          };
        },
      },
      mcp: {
        listResources: async (request) => {
          mcpCalls += 1;
          callOrder.push("mcp.resources");
          mcpServerId = stringValue(record(request).serverId);
          return {
            ok: true,
            output: {
              serverId: mcpServerId,
              resources: [{
                uri: "file:///official-adapters-mcp-ok.md",
                name: "official-adapters-mcp-ok",
                mimeType: "text/markdown",
                text: "official-adapters-mcp-ok",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_official_adapters_smoke",
              adapterMountedBy: "application",
            },
          };
        },
      },
      skill: {
        load: async (request) => {
          skillCalls += 1;
          callOrder.push("skill.load");
          skillRequestName = stringValue(record(request).name);
          return {
            ok: true,
            output: {
              name: skillRequestName ?? "application.skill.officialAdapters",
              summary: "Application official adapters smoke returned skill guidance.",
              content: "official-adapters-skill-ok",
              documents: [{
                title: "Official Adapters Skill",
                text: "official-adapters-skill-ok",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_official_adapters_smoke",
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
      baseToolAdapters: adapters,
      mcpServers: [{
        serverId: "official-adapters-mcp",
        transport: "stdio",
        command: "node",
        args: ["official-adapters-mcp-server.js"],
      }],
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
                call_id: contextCallId,
                arguments: JSON.stringify({
                  kind: "workspaceIndex",
                  query: "runtime official adapters",
                  limit: 1,
                }),
              }],
            };
          }
          if (providerCalls === 2) {
            return {
              output: [{
                type: "function_call",
                name: "mcp.resources",
                call_id: mcpCallId,
                arguments: JSON.stringify({
                  operation: "list",
                  serverId: "official-adapters-mcp",
                }),
              }],
            };
          }
          if (providerCalls === 3) {
            return {
              output: [{
                type: "function_call",
                name: "skill.load",
                call_id: skillCallId,
                arguments: JSON.stringify({
                  name: "application.skill.officialAdapters",
                }),
              }],
            };
          }
          return { output_text: "application official adapters smoke completed" };
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
      const mountMatrixResult = await transport.dispatch({
        type: "application.inspectOfficialAdapterMountMatrix",
      });
      const applicationOfficialAdapterMountMatrix = officialAdapterMountMatrixOutput(mountMatrixResult.output);
      const officialAdapterMountMatrix = applicationOfficialAdapterMountMatrix.matrix;
      const result = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "Exercise context, MCP, and skill official adapters in order.",
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const contextOutput = findToolOutput(providerBodies[1], contextCallId);
      const mcpOutput = findToolOutput(providerBodies[2], mcpCallId);
      const skillOutput = findToolOutput(providerBodies[3], skillCallId);
      const providerRoundTrip = {
        contextOutputFedBack: contextOutput !== undefined,
        mcpOutputFedBack: mcpOutput !== undefined,
        skillOutputFedBack: skillOutput !== undefined,
        contextOutputIncludesMaterial: contextOutput?.includes("official-adapters-context-ok") ?? false,
        mcpOutputIncludesResource: mcpOutput?.includes("official-adapters-mcp-ok") ?? false,
        skillOutputIncludesSummary: skillOutput?.includes("official-adapters-skill-ok") ?? false,
        callIds: [
          contextOutput === undefined ? undefined : contextCallId,
          mcpOutput === undefined ? undefined : mcpCallId,
          skillOutput === undefined ? undefined : skillCallId,
        ].filter((callId): callId is string => callId !== undefined),
        providerInputItemCounts: [
          providerInput(providerBodies[1]).length,
          providerInput(providerBodies[2]).length,
          providerInput(providerBodies[3]).length,
        ],
      };
      const toolExposure = providerToolExposure(providerBodies[0]);
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
      const eventNames = [...new Set(events.map(eventSummary))];
      const reportResult = await transport.dispatch({
        type: "application.inspectOfficialAdapters",
        query: { familyKey: "mcp", toolId: "mcp.resources" },
        expectedCallOrder: ["context.load", "mcp.resources", "skill.load"],
      });
      const applicationOfficialAdapterReport = officialAdapterReportOutput(reportResult.output);
      const officialAdapterReport = applicationOfficialAdapterReport.report;
      const officialAdapterIndex = applicationOfficialAdapterReport.index;
      const officialAdapterQuery = applicationOfficialAdapterReport.query;
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application official adapters smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 4 &&
          view.counters.toolCalls === 3 &&
          providerCalls === 4 &&
          contextCalls === 1 &&
          mcpCalls === 1 &&
          skillCalls === 1 &&
          callOrder.join(",") === "context.load,mcp.resources,skill.load" &&
          providerRoundTrip.contextOutputFedBack &&
          providerRoundTrip.mcpOutputFedBack &&
          providerRoundTrip.skillOutputFedBack &&
          providerRoundTrip.contextOutputIncludesMaterial &&
          providerRoundTrip.mcpOutputIncludesResource &&
          providerRoundTrip.skillOutputIncludesSummary &&
          toolExposure.exposesContextTool &&
          toolExposure.exposesMcpTool &&
          toolExposure.exposesSkillTool &&
          toolEvents.completedToolIds.join(",") === "context.load,mcp.resources,skill.load" &&
          eventNames.includes("final") &&
          officialAdapterReport.status === "ok" &&
          officialAdapterReport.coverage.hasCompositionOrder &&
          officialAdapterReport.composition.callOrder.join(",") === "context.load,mcp.resources,skill.load" &&
          officialAdapterReport.coverage.hasProviderToolExposure &&
          officialAdapterReport.coverage.hasProviderRoundTrip &&
          officialAdapterReport.coverage.hasCompletedToolEvents &&
          applicationOfficialAdapterReport.kind === "praxis.application.officialAdapterReport" &&
          officialAdapterQuery.returnedAdapters === 1 &&
          applicationOfficialAdapterMountMatrix.kind === "praxis.application.officialAdapterMountMatrix" &&
          officialAdapterMountMatrix.surface === "runtime.officialAdapterPlane.mountMatrix" &&
          officialAdapterMountMatrix.status === "ready" &&
          officialAdapterMountMatrix.adapters.map((adapter) => adapter.toolId).join(",") === "context.load,mcp.resources,skill.load" &&
          officialAdapterMountMatrix.adapters.every((adapter) => adapter.evidenceStatus === "executor-backed") &&
          officialAdapterMountMatrix.totals.readyAdapters === 3 &&
          officialAdapterMountMatrix.totals.missingPorts === 0 &&
          officialAdapterMountMatrix.totals.declaredOnlyPorts === 0 &&
          officialAdapterMountMatrix.guardrails.executesAdapters === false
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
          callOrder,
          context: {
            calls: contextCalls,
            kind: contextKind,
            query: contextQuery,
          },
          mcp: {
            calls: mcpCalls,
            serverId: mcpServerId,
          },
          skill: {
            calls: skillCalls,
            requestName: skillRequestName,
          },
        },
        providerRoundTrip,
        providerToolExposure: toolExposure,
        toolEvents,
        officialAdapterReport: {
          kind: officialAdapterReport.kind,
          status: officialAdapterReport.status,
          sourceKind: officialAdapterReport.sourceKind,
          coverage: officialAdapterReport.coverage,
          composition: {
            callOrder: officialAdapterReport.composition.callOrder,
            expectedCallOrder: officialAdapterReport.composition.expectedCallOrder,
            orderMatches: officialAdapterReport.composition.orderMatches,
          },
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
          applicationCommand: {
            kind: applicationOfficialAdapterReport.kind,
            sessionId: applicationOfficialAdapterReport.sessionId,
            runtimeId: applicationOfficialAdapterReport.runtimeId,
            publicSafe: applicationOfficialAdapterReport.publicSafe,
          },
          publicSafe: officialAdapterReport.publicSafe,
        },
        officialAdapterMountMatrix: {
          kind: applicationOfficialAdapterMountMatrix.kind,
          runtimeSurface: officialAdapterMountMatrix.surface,
          status: officialAdapterMountMatrix.status,
          toolIds: officialAdapterMountMatrix.adapters.map((adapter) => adapter.toolId),
          evidenceStatuses: officialAdapterMountMatrix.adapters.map((adapter) => adapter.evidenceStatus),
          readyAdapters: officialAdapterMountMatrix.totals.readyAdapters,
          missingPorts: officialAdapterMountMatrix.totals.missingPorts,
          declaredOnlyPorts: officialAdapterMountMatrix.totals.declaredOnlyPorts,
          executesAdapters: officialAdapterMountMatrix.guardrails.executesAdapters,
          inspectedBeforeSubmitTurn: true,
          publicSafe: applicationOfficialAdapterMountMatrix.publicSafe,
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
  const result = await runApplicationOfficialAdaptersSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
