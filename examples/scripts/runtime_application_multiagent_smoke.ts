import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { praxis, type RuntimeMultiagentReport } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationMultiagentReportOutput,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationMultiagentSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  projectRoot: string;
  view: {
    status: PraxisApplicationViewModel["status"];
    finalOutput: string | undefined;
    counters: PraxisApplicationViewModel["counters"];
    agents: PraxisApplicationViewModel["agents"];
  };
  providerCalls: number;
  providerToolExposure: {
    expectedProviderName: string;
    exposesExpectedTool: boolean;
    exposedProviderNames: readonly string[];
    toolCount: number;
  };
  toolEvent: {
    toolId: string | undefined;
    toolStatus: string | undefined;
    childSessionId: string | undefined;
    familyKey: string | undefined;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesChildSession: boolean;
    secondProviderInputItems: number;
  };
  backgroundRun: {
    childProviderCalled: boolean;
    childReplyText: string | undefined;
    childRuntimeId: string | undefined;
  };
  multiagentReport: {
    applicationCommandKind: string;
    kind: RuntimeMultiagentReport["kind"];
    status: RuntimeMultiagentReport["status"];
    sourceKind: RuntimeMultiagentReport["sourceKind"];
    applicationSessionId: string;
    childSessionId: string | undefined;
    childRuntimeId: string | undefined;
    coverage: RuntimeMultiagentReport["coverage"];
    index: {
      totalSessions: number;
      childSessionIds: readonly string[];
      byToolId: Readonly<Record<string, number>>;
      byEventKind: Readonly<Record<string, number>>;
    };
    query: {
      returnedSessions: number;
      returnedMessages: number;
      refs: readonly string[];
    };
    publicSafe: true;
  };
  events: readonly string[];
};

export type RuntimeApplicationMultiagentSmokeInput = {
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

function multiagentReportOutput(value: unknown): PraxisApplicationMultiagentReportOutput {
  if (record(value).kind !== "praxis.application.multiagentReport") {
    throw new Error("application.inspectMultiagent did not return a multiagent report output.");
  }
  return value as PraxisApplicationMultiagentReportOutput;
}

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationMultiagentSmokeResult["providerToolExposure"] {
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
    id: "application-multiagent-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-multiagent-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application multiagent smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-multiagent-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-multiagent-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationMultiagentSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationMultiagentSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationMultiagentSmoke",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationMultiagentSmoke.yolo",
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
      praxis.basetool.byId("agent.spawn", { profileName: "agentCore" }).tool,
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "agent:spawn", "project:session"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationMultiagentSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-multiagent-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationMultiagentSmokeAgent",
    application: { id: "application.multiagent-smoke" },
    agent: { id: "agent.example.applicationMultiagentSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind === "tool") {
    const metadata = record(event.metadata);
    return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
  }
  if (event.kind === "runtime" && String(event.eventId).includes(".multiagent.spawned")) return "runtime:spawned";
  if (event.kind === "runtime" && String(event.eventId).includes(".multiagent.completed")) return "runtime:completed";
  return event.kind;
}

async function waitFor(
  predicate: () => boolean,
  input: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = input.timeoutMs ?? 1000;
  const intervalMs = input.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return predicate();
}

export async function runApplicationMultiagentSmoke(
  input: RuntimeApplicationMultiagentSmokeInput = {},
): Promise<RuntimeApplicationMultiagentSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-multiagent-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let childProviderCalled = false;
    let childReplyText: string | undefined;
    let childRuntimeId: string | undefined;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];

    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "agentCore",
      liveProviderResolver: async (_manifest, context) => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          if (context?.sessionId?.startsWith("agent-session.") === true) {
            childProviderCalled = true;
            childRuntimeId = context.runtimeId;
            childReplyText = "application multiagent child completed";
            return { output_text: childReplyText };
          }
          providerCalls += 1;
          providerBodies.push(envelope.body);
          if (providerCalls === 1) {
            return {
              output: [{
                type: "function_call",
                name: "agent.spawn",
                call_id: "application-multiagent-spawn-call",
                arguments: JSON.stringify({
                  name: "docs-child",
                  task: "Return application multiagent child completed.",
                  lifecycle: "oneshot",
                }),
              }],
            };
          }
          return { output_text: "application multiagent smoke completed" };
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
          text: "Spawn a child agent and wait for application multiagent evidence.",
          cwd: projectRoot,
        },
      });
      await waitFor(() => events.some((event) =>
        event.kind === "runtime" && String(event.eventId).includes(".multiagent.completed")
      ));
      const view = created.runtime.getView();
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "agent.spawn" && metadata.toolStatus === "completed";
      });
      const toolMetadata = record(completedToolEvent?.metadata);
      const resultMetadata = record(toolMetadata.resultMetadata);
      const toolOutput = record(toolMetadata.output);
      const childSessionId = stringValue(resultMetadata.sessionId)
        ?? stringValue(record(toolOutput.session).sessionId);
      const secondProviderBody = record(providerBodies[1]);
      const secondProviderInput = Array.isArray(secondProviderBody.input) ? secondProviderBody.input : [];
      const toolResultInput = secondProviderInput
        .map((item) => record(item))
        .find((item) => item.type === "function_call_output");
      const toolResultOutput = typeof toolResultInput?.output === "string" ? toolResultInput.output : "";
      const providerRoundTrip = {
        toolOutputFedBack: toolResultInput !== undefined,
        callId: stringValue(toolResultInput?.call_id),
        outputIncludesChildSession: toolResultOutput.includes("agent-session.application-multiagent-smoke"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const childSessionIdFromToolOutput = toolResultOutput
        .match(/agent-session\.application-multiagent-smoke\.[A-Za-z0-9_.-]+/)?.[0];
      const childReplyEvent = events.find((event) =>
        event.kind === "runtime" && String(event.eventId).includes(".multiagent.completed")
      );
      const eventNames = [...new Set(events.map(eventSummary))];
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_agent_spawn");
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        childSessionId: childSessionId ?? childSessionIdFromToolOutput,
        familyKey: stringValue(toolMetadata.familyKey),
      };
      const inspectMultiagent = await transport.dispatch({
        type: "application.inspectMultiagent",
        query: { sessionId: toolEvent.childSessionId },
      });
      if (!inspectMultiagent.ok) {
        throw new Error(inspectMultiagent.error.message);
      }
      const applicationMultiagentReport = multiagentReportOutput(inspectMultiagent.output);
      const multiagentReport = applicationMultiagentReport.report;
      const multiagentIndex = applicationMultiagentReport.index;
      const childQuery = applicationMultiagentReport.query;
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application multiagent smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          childProviderCalled &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-multiagent-spawn-call" &&
          providerRoundTrip.outputIncludesChildSession &&
          toolExposure.exposesExpectedTool &&
          toolEvent.toolId === "agent.spawn" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.childSessionId?.startsWith("agent-session.application-multiagent-smoke.") === true &&
          view.agents.active === 1 &&
          eventNames.includes("tool:agent.spawn:completed") &&
          eventNames.includes("runtime:spawned") &&
          eventNames.includes("runtime:completed") &&
          eventNames.includes("final") &&
          multiagentReport.status === "ok" &&
          multiagentReport.coverage.hasApplicationToolExposure &&
          multiagentReport.coverage.hasApplicationEventPath &&
          multiagentReport.coverage.hasBackgroundRuntime &&
          multiagentReport.coverage.hasReplyCorrelation &&
          applicationMultiagentReport.kind === "praxis.application.multiagentReport" &&
          applicationMultiagentReport.publicSafe &&
          applicationMultiagentReport.sessionId === view.sessionId &&
          childQuery.returnedSessions === 1
          ? "ok"
          : "failed",
        startedAt,
        finishedAt: now(),
        projectRoot,
        view: {
          status: view.status,
          finalOutput: view.finalOutput,
          counters: view.counters,
          agents: view.agents,
        },
        providerCalls: providerCalls + (childProviderCalled ? 1 : 0),
        providerToolExposure: toolExposure,
        toolEvent,
        providerRoundTrip,
        backgroundRun: {
          childProviderCalled,
          childReplyText,
          childRuntimeId,
        },
        multiagentReport: {
          applicationCommandKind: applicationMultiagentReport.kind,
          kind: multiagentReport.kind,
          status: multiagentReport.status,
          sourceKind: multiagentReport.sourceKind,
          applicationSessionId: applicationMultiagentReport.sessionId,
          childSessionId: multiagentReport.session.childSessionId,
          childRuntimeId: multiagentReport.session.childRuntimeId,
          coverage: multiagentReport.coverage,
          index: {
            totalSessions: multiagentIndex.totalSessions,
            childSessionIds: multiagentIndex.childSessionIds,
            byToolId: multiagentIndex.byToolId,
            byEventKind: multiagentIndex.byEventKind,
          },
          query: {
            returnedSessions: childQuery.returnedSessions,
            returnedMessages: childQuery.returnedMessages,
            refs: childQuery.refs,
          },
          publicSafe: multiagentReport.publicSafe,
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

async function main(): Promise<void> {
  const result = await runApplicationMultiagentSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
