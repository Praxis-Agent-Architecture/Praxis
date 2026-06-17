import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis, type BaseToolExecutorPort, type RuntimeOfficialAdapterReport } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationSkillSmokeResult = {
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
    requestName: string | undefined;
    requestPath: string | undefined;
    calls: number;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesSkillSummary: boolean;
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
    skillName: string | undefined;
    familyKey: string | undefined;
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

export type RuntimeApplicationSkillSmokeInput = {
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

function stringArrayValue(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationSkillSmokeResult["providerToolExposure"] {
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
    id: "application-skill-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-skill-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application skill smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-skill-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-skill-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationSkillSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationSkillSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationSkillSmoke",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationSkillSmoke.yolo",
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
      praxis.basetool.extension.skillLoad({ profileName: "agentCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "skill:read", "filesystem:read"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationSkillSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-skill-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationSkillSmokeAgent",
    application: { id: "application.skill-smoke" },
    agent: { id: "agent.example.applicationSkillSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationSkillSmoke(
  input: RuntimeApplicationSkillSmokeInput = {},
): Promise<RuntimeApplicationSkillSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-skill-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    let providerCalls = 0;
    let adapterCalls = 0;
    let adapterRequestName: string | undefined;
    let adapterRequestPath: string | undefined;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const skillAdapters: Partial<BaseToolExecutorPort> = {
      skill: {
        load: async (request) => {
          adapterCalls += 1;
          adapterRequestName = stringValue(record(request).name);
          adapterRequestPath = stringValue(record(request).path);
          return {
            ok: true,
            output: {
              name: adapterRequestName ?? "application.skill.runtimeMount",
              path: adapterRequestPath,
              summary: "Application-owned skill adapter returned reusable Praxis runtime guidance.",
              content: "Use application-owned skill adapters as runtime-mounted experience. Skill evidence: application-skill-ok.",
              documents: [{
                title: "Application Skill Runtime Mount",
                text: "application-skill-ok",
              }],
            },
            metadata: {
              source: "examples.scripts.runtime_application_skill_smoke",
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
      baseToolAdapters: skillAdapters,
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          if (providerCalls === 1) {
            return {
              output: [{
                type: "function_call",
                name: "skill.load",
                call_id: "application-skill-smoke-call",
                arguments: JSON.stringify({
                  name: "application.skill.runtimeMount",
                }),
              }],
            };
          }
          return { output_text: "application skill smoke completed" };
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
          text: "Load the application skill runtime mount guidance.",
          cwd: projectRoot,
        },
      });
      const view = result.view;
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "skill.load" && metadata.toolStatus === "completed";
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
        outputIncludesSkillSummary: toolResultOutput.includes("application-skill-ok"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_skill_load");
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        skillName: stringValue(resultMetadata.skillName),
        familyKey: stringValue(toolMetadata.familyKey),
        humanResultSummary: stringArrayValue(toolMetadata.humanResultSummary),
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      const officialAdapterReport = praxis.runtime.createRuntimeOfficialAdapterReport({
        sourceKind: "application-events",
        adapters: [{
          familyKey: "skill",
          toolId: toolEvent.toolId,
          toolStatus: toolEvent.toolStatus,
          expectedProviderName: toolExposure.expectedProviderName,
          providerToolExposed: toolExposure.exposesExpectedTool,
          exposedProviderNames: toolExposure.exposedProviderNames,
          adapterCalls,
          callId: providerRoundTrip.callId,
          outputFedBack: providerRoundTrip.toolOutputFedBack,
          outputIncludesEvidence: providerRoundTrip.outputIncludesSkillSummary,
          skillName: toolEvent.skillName,
          requestName: adapterRequestName,
          humanResultSummary: toolEvent.humanResultSummary.join(" "),
        }],
        composition: {
          callOrder: ["skill.load"],
          expectedCallOrder: ["skill.load"],
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
        query: { familyKey: "skill", toolId: "skill.load" },
      });
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application skill smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          adapterCalls === 1 &&
          adapterRequestName === "application.skill.runtimeMount" &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-skill-smoke-call" &&
          providerRoundTrip.outputIncludesSkillSummary &&
          toolExposure.exposesExpectedTool &&
          toolEvent.toolId === "skill.load" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.skillName === "application.skill.runtimeMount" &&
          toolEvent.familyKey === "skill" &&
          eventNames.includes("tool:skill.load:completed") &&
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
          requestName: adapterRequestName,
          requestPath: adapterRequestPath,
          calls: adapterCalls,
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
  const result = await runApplicationSkillSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
