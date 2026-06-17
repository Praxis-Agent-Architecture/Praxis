import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationEvent,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationRollbackSmokeResult = {
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
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesExitCode: boolean;
    secondProviderInputItems: number;
  };
  providerToolExposure: {
    expectedProviderName: string;
    exposesExpectedTool: boolean;
    exposedProviderNames: readonly string[];
    toolCount: number;
  };
  rollback: {
    exitCode: number | undefined;
    beforeText: string;
    afterText: string;
    fileRestored: boolean;
  };
  toolEvent: {
    toolId: string | undefined;
    toolStatus: string | undefined;
    sandboxMode: string | undefined;
    commandSandboxProviderFamily: string | undefined;
    commandSandboxApplied: boolean | undefined;
    workspaceRollbackRequired: boolean | undefined;
    workspaceRollbackRestored: boolean | undefined;
    workspaceRollbackChangedFiles: number | undefined;
  };
  events: readonly string[];
};

export type RuntimeApplicationRollbackSmokeInput = {
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

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationRollbackSmokeResult["providerToolExposure"] {
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
    id: "application-rollback-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-rollback-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application rollback smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-rollback-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-rollback-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationRollbackSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationRollbackSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationRollbackSmoke",
  });
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationRollbackSmoke.yolo",
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
      praxis.tool("shell.run", {
        family: "coreBase",
        group: "shell",
        description: "Run a governed shell command through the application runtime.",
      }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute"],
    }),
    loop: praxis.loop({
      strategy: "tool-calling-v1",
      maxModelTurns: 2,
      maxToolCalls: 1,
    }),
  });
}

export default ApplicationRollbackSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-rollback-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationRollbackSmokeAgent",
    application: { id: "application.rollback-smoke" },
    agent: { id: "agent.example.applicationRollbackSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
  await writeFile(path.join(root, "state.txt"), "before\n", "utf8");
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationRollbackSmoke(
  input: RuntimeApplicationRollbackSmokeInput = {},
): Promise<RuntimeApplicationRollbackSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-rollback-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const statePath = path.join(projectRoot, "state.txt");
    const beforeText = await readFile(statePath, "utf8");
    let providerCalls = 0;
    const providerBodies: unknown[] = [];
    const events: PraxisApplicationEvent[] = [];
    const created = await createApplicationProjectRuntime(projectRoot, {
      now,
      mode: "live",
      permissionProfile: "yolo",
      toolProfile: "codingCore",
      liveProviderResolver: async () => ({
        auth: authEnvelope(),
        providerCaller: async (envelope) => {
          providerCalls += 1;
          providerBodies.push(envelope.body);
          if (providerCalls === 1) {
            return {
              output: [{
                type: "function_call",
                name: "shell.run",
                call_id: "application-rollback-smoke-call",
                arguments: JSON.stringify({
                  command: "printf after > state.txt; exit 2",
                  cwd: projectRoot,
                  dryRun: false,
                }),
              }],
            };
          }
          return { output_text: "application rollback smoke completed" };
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
          text: "Run the failed rollback smoke shell command.",
          cwd: projectRoot,
        },
      });
      const afterText = await readFile(statePath, "utf8");
      const view = result.view;
      const completedToolEvent = events.find((event) => {
        const metadata = record(event.metadata);
        return event.kind === "tool" && metadata.toolId === "shell.run" && metadata.toolStatus === "completed";
      });
      const toolMetadata = record(completedToolEvent?.metadata);
      const resultMetadata = record(toolMetadata.resultMetadata);
      const secondProviderBody = record(providerBodies[1]);
      const secondProviderInput = Array.isArray(secondProviderBody.input) ? secondProviderBody.input : [];
      const toolResultInput = secondProviderInput
        .map((item) => record(item))
        .find((item) => item.type === "function_call_output");
      const toolResultOutput = typeof toolResultInput?.output === "string" ? toolResultInput.output : "";
      const exitCode = numberValue(resultMetadata.processStatus) ?? (toolResultOutput.includes('"exitCode":2') ? 2 : undefined);
      const providerRoundTrip = {
        toolOutputFedBack: toolResultInput !== undefined,
        callId: stringValue(toolResultInput?.call_id),
        outputIncludesExitCode: toolResultOutput.includes('"exitCode":2') || toolResultOutput.includes("exitCode"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_shell_run");
      const rollback = {
        exitCode,
        beforeText,
        afterText,
        fileRestored: beforeText === "before\n" && afterText === "before\n",
      };
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        sandboxMode: stringValue(resultMetadata.sandboxMode),
        commandSandboxProviderFamily: stringValue(resultMetadata.commandSandboxProviderFamily),
        commandSandboxApplied: booleanValue(resultMetadata.commandSandboxApplied),
        workspaceRollbackRequired: booleanValue(resultMetadata.workspaceRollbackRequired),
        workspaceRollbackRestored: booleanValue(resultMetadata.workspaceRollbackRestored),
        workspaceRollbackChangedFiles: numberValue(resultMetadata.workspaceRollbackChangedFiles),
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === "application rollback smoke completed" &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-rollback-smoke-call" &&
          providerRoundTrip.outputIncludesExitCode &&
          toolExposure.exposesExpectedTool &&
          rollback.exitCode === 2 &&
          rollback.fileRestored &&
          toolEvent.toolId === "shell.run" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.sandboxMode === "workspace-rollback" &&
          toolEvent.commandSandboxProviderFamily === "workspace-rollback" &&
          toolEvent.commandSandboxApplied === true &&
          toolEvent.workspaceRollbackRequired === true &&
          toolEvent.workspaceRollbackRestored === true &&
          toolEvent.workspaceRollbackChangedFiles === 1 &&
          eventNames.includes("tool:shell.run:completed") &&
          eventNames.includes("final")
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
        providerRoundTrip,
        providerToolExposure: toolExposure,
        rollback,
        toolEvent,
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
  const result = await runApplicationRollbackSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
