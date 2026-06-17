import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis, type BaseToolExecutorPort, type RuntimeOfficialAdapterReport } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationMcpMountMatrixOutput,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationMcpSmokeResult = {
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
    serverId: string | undefined;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesResource: boolean;
    secondProviderInputItems: number;
  };
  providerToolExposure: {
    expectedProviderName: string;
    exposesExpectedTool: boolean;
    exposedProviderNames: readonly string[];
    toolCount: number;
  };
  mcpMountMatrix: {
    kind: PraxisApplicationMcpMountMatrixOutput["kind"];
    runtimeSurface: PraxisApplicationMcpMountMatrixOutput["matrix"]["surface"];
    status: PraxisApplicationMcpMountMatrixOutput["matrix"]["status"];
    resourceOperations: readonly string[];
    resourceOperationsReady: boolean;
    promptOperations: readonly string[];
    promptOperationsReady: boolean;
    completionOperations: readonly string[];
    completionOperationsReady: boolean;
    missingPorts: number;
    resourceOperationMissingPorts: number;
    promptOperationMissingPorts: number;
    completionOperationMissingPorts: number;
    declaredOnlyPorts: number;
    missingNativeInventories: number;
    inspectedBeforeSubmitTurn: boolean;
    publicSafe: true;
  };
  toolEvent: {
    toolId: string | undefined;
    toolStatus: string | undefined;
    familyKey: string | undefined;
    resourceCount: number | undefined;
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

export type RuntimeApplicationMcpSmokeInput = {
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

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationMcpSmokeResult["providerToolExposure"] {
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

function mcpMountMatrixOutput(value: unknown): PraxisApplicationMcpMountMatrixOutput {
  const output = record(value);
  if (output.kind !== "praxis.application.mcpMountMatrix") {
    throw new Error("application.inspectMcpMountMatrix did not return praxis.application.mcpMountMatrix");
  }
  return value as PraxisApplicationMcpMountMatrixOutput;
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "application-mcp-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-mcp-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application MCP smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-mcp-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-mcp-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationMcpSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationMcpSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationMcpSmoke",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationMcpSmoke.yolo",
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
      praxis.basetool.extension.mcpResources({ profileName: "agentCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "mcp:resource:list"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationMcpSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-mcp-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationMcpSmokeAgent",
    application: { id: "application.mcp-smoke" },
    agent: { id: "agent.example.applicationMcpSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationMcpSmoke(
  input: RuntimeApplicationMcpSmokeInput = {},
): Promise<RuntimeApplicationMcpSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-mcp-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let adapterCalls = 0;
    let adapterServerId: string | undefined;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const mcpAdapters: Partial<BaseToolExecutorPort> = {
      mcp: {
        listResources: async (request) => {
          adapterCalls += 1;
          adapterServerId = stringValue(record(request).serverId);
          return {
            ok: true,
            output: {
              serverId: adapterServerId,
              resources: [{
                uri: "file:///application-mcp-ok.md",
                name: "application-mcp-ok",
                mimeType: "text/markdown",
                text: "application-mcp-ok",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_mcp_smoke",
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
      baseToolAdapters: mcpAdapters,
      mcpServers: [{
        serverId: "app-mcp",
        transport: "stdio",
        command: "node",
        args: ["app-mcp-server.js"],
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
                name: "mcp.resources",
                call_id: "application-mcp-smoke-call",
                arguments: JSON.stringify({
                  operation: "list",
                  serverId: "app-mcp",
                }),
              }],
            };
          }
          return { output_text: "application MCP smoke completed" };
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
      const mountMatrixInspected = mcpMountMatrixOutput((await transport.dispatch({
        type: "application.inspectMcpMountMatrix",
        nativeToolInventoryByServerId: {
          "app-mcp": [
            { name: "app.resource.list", description: "List application MCP resources.", inputSchema: { type: "object", properties: {} } },
          ],
        },
      })).output);
      const result = await transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "List application MCP resources.",
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "mcp.resources" && metadata.toolStatus === "completed";
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
        outputIncludesResource: toolResultOutput.includes("application-mcp-ok"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_mcp_resources");
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        familyKey: stringValue(toolMetadata.familyKey),
        resourceCount: numberValue(resultMetadata.resourceCount),
        humanResultSummary: stringArrayValue(toolMetadata.humanResultSummary),
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      const mcpMountMatrix = {
        kind: mountMatrixInspected.kind,
        runtimeSurface: mountMatrixInspected.matrix.surface,
        status: mountMatrixInspected.matrix.status,
        resourceOperations: mountMatrixInspected.matrix.resourceOperations.map((operation) =>
          `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`),
        resourceOperationsReady: mountMatrixInspected.matrix.resourceOperations.every((operation) =>
          operation.decision === "allowed" && operation.evidenceStatus === "executor-backed"),
        promptOperations: mountMatrixInspected.matrix.promptOperations.map((operation) =>
          `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`),
        promptOperationsReady: mountMatrixInspected.matrix.promptOperations.every((operation) =>
          operation.decision === "allowed" && operation.evidenceStatus === "executor-backed"),
        completionOperations: mountMatrixInspected.matrix.completionOperations.map((operation) =>
          `${operation.operation}:${operation.portPath}:${operation.evidenceStatus}`),
        completionOperationsReady: mountMatrixInspected.matrix.completionOperations.every((operation) =>
          operation.decision === "allowed" && operation.evidenceStatus === "executor-backed"),
        missingPorts: mountMatrixInspected.matrix.totals.missingPorts,
        resourceOperationMissingPorts: mountMatrixInspected.matrix.totals.resourceOperationMissingPorts,
        promptOperationMissingPorts: mountMatrixInspected.matrix.totals.promptOperationMissingPorts,
        completionOperationMissingPorts: mountMatrixInspected.matrix.totals.completionOperationMissingPorts,
        declaredOnlyPorts: mountMatrixInspected.matrix.totals.declaredOnlyPorts,
        missingNativeInventories: mountMatrixInspected.matrix.totals.missingNativeInventories,
        inspectedBeforeSubmitTurn: true,
        publicSafe: mountMatrixInspected.publicSafe,
      };
      const officialAdapterReport = praxis.runtime.createRuntimeOfficialAdapterReport({
        sourceKind: "application-events",
        adapters: [{
          familyKey: "mcp",
          toolId: toolEvent.toolId,
          toolStatus: toolEvent.toolStatus,
          expectedProviderName: toolExposure.expectedProviderName,
          providerToolExposed: toolExposure.exposesExpectedTool,
          exposedProviderNames: toolExposure.exposedProviderNames,
          adapterCalls,
          callId: providerRoundTrip.callId,
          outputFedBack: providerRoundTrip.toolOutputFedBack,
          outputIncludesEvidence: providerRoundTrip.outputIncludesResource,
          resourceCount: toolEvent.resourceCount,
          serverId: adapterServerId,
          humanResultSummary: toolEvent.humanResultSummary.join(" "),
        }],
        composition: {
          callOrder: ["mcp.resources"],
          expectedCallOrder: ["mcp.resources"],
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
        query: { familyKey: "mcp", toolId: "mcp.resources" },
      });
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application MCP smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          adapterCalls === 1 &&
          adapterServerId === "app-mcp" &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-mcp-smoke-call" &&
          providerRoundTrip.outputIncludesResource &&
          toolExposure.exposesExpectedTool &&
          toolEvent.toolId === "mcp.resources" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.familyKey === "mcp" &&
          toolEvent.resourceCount === 1 &&
          eventNames.includes("tool:mcp.resources:completed") &&
          eventNames.includes("final") &&
          officialAdapterReport.status === "ok" &&
          officialAdapterReport.coverage.hasProviderToolExposure &&
          officialAdapterReport.coverage.hasProviderRoundTrip &&
          officialAdapterReport.coverage.hasCompletedToolEvents &&
          officialAdapterQuery.returnedAdapters === 1
          && mcpMountMatrix.resourceOperationsReady
          && mcpMountMatrix.resourceOperations.join(",") === "list:mcp.listResources:executor-backed,templates:mcp.listResourceTemplates:executor-backed,read:mcp.readResource:executor-backed"
          && mcpMountMatrix.promptOperationsReady
          && mcpMountMatrix.promptOperations.join(",") === "list:mcp.listPrompts:executor-backed,get:mcp.getPrompt:executor-backed"
          && mcpMountMatrix.completionOperationsReady
          && mcpMountMatrix.completionOperations.join(",") === "complete:mcp.complete:executor-backed"
          && mcpMountMatrix.resourceOperationMissingPorts === 0
          && mcpMountMatrix.promptOperationMissingPorts === 0
          && mcpMountMatrix.completionOperationMissingPorts === 0
          && mcpMountMatrix.declaredOnlyPorts === 0
          && mcpMountMatrix.missingNativeInventories === 0
          && mcpMountMatrix.inspectedBeforeSubmitTurn
          && mcpMountMatrix.publicSafe
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
          serverId: adapterServerId,
        },
        providerRoundTrip,
        providerToolExposure: toolExposure,
        mcpMountMatrix,
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
  const result = await runApplicationMcpSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
