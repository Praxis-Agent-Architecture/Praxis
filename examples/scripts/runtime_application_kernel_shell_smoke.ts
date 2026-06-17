import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";
import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
  type PraxisApplicationCommandResult,
  type PraxisApplicationEvent,
  type PraxisApplicationRuntime,
  type PraxisApplicationViewModel,
} from "@praxis-ai/praxis/application";

export type RuntimeApplicationKernelShellSmokeResult = {
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
    outputIncludesStdout: boolean;
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
    sandboxMode: string | undefined;
    sandboxPlanStatus: string | undefined;
    commandSandboxProviderFamily: string | undefined;
    commandSandboxMode: string | undefined;
    commandSandboxApplied: boolean | undefined;
    policyProfile: string | undefined;
  };
  events: readonly string[];
  retainedEvents: readonly PraxisApplicationEvent[];
  output?: unknown;
};

export type RuntimeApplicationKernelShellSmokeInput = {
  now?: () => string;
  projectRoot?: string;
  finalOutputText?: string;
  beforeSubmitTurn?: (context: {
    runtime: PraxisApplicationRuntime;
    submitTurn: () => Promise<PraxisApplicationCommandResult>;
  }) => Promise<{
    result?: PraxisApplicationCommandResult;
    output?: unknown;
  } | void>;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function providerToolExposure(body: unknown, expectedProviderName: string): RuntimeApplicationKernelShellSmokeResult["providerToolExposure"] {
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
    id: "application-kernel-shell-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "application-kernel-shell-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create application kernel shell smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "application-kernel-shell-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "application-kernel-shell-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

function applicationAgentSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";

export class ApplicationKernelShellSmokeAgent extends praxis.Agent {
  identity = "agent.example.applicationKernelShellSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.applicationKernelShellSmoke",
  });
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.applicationKernelShellSmoke.yolo",
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

export default ApplicationKernelShellSmokeAgent;
`;
}

async function createSmokeProject(root: string): Promise<void> {
  await writeFile(path.join(root, "rax.project.json"), `${JSON.stringify({
    id: "application-kernel-shell-smoke",
    entry: "praxis.agent.ts",
    export: "ApplicationKernelShellSmokeAgent",
    application: { id: "application.kernel-shell-smoke" },
    agent: { id: "agent.example.applicationKernelShellSmoke" },
  }, null, 2)}\n`);
  await writeFile(path.join(root, "praxis.agent.ts"), applicationAgentSource());
}

function eventSummary(event: PraxisApplicationEvent): string {
  if (event.kind !== "tool") return event.kind;
  const metadata = record(event.metadata);
  return `tool:${String(metadata.toolId ?? "unknown")}:${String(metadata.toolStatus ?? "unknown")}`;
}

export async function runApplicationKernelShellSmoke(
  input: RuntimeApplicationKernelShellSmokeInput = {},
): Promise<RuntimeApplicationKernelShellSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const tempRoot = path.join(process.cwd(), ".tmp");
  const ownsProjectRoot = input.projectRoot === undefined;
  await mkdir(input.projectRoot ?? tempRoot, { recursive: true });
  const projectRoot = input.projectRoot ?? await mkdtemp(path.join(tempRoot, "praxis-application-kernel-shell-smoke-"));
  try {
    await createSmokeProject(projectRoot);
    const finalOutputText = input.finalOutputText ?? "application shell smoke completed";
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
                call_id: "application-kernel-shell-call",
                arguments: JSON.stringify({
                  command: "printf application-shell-ok",
                  cwd: projectRoot,
                  dryRun: false,
                }),
              }],
            };
          }
          return { output_text: finalOutputText };
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
      const submitTurn = () => transport.dispatch({
        type: "application.submitTurn",
        mode: "live",
        input: {
          type: "application.input",
          text: "Run the sandboxed application shell smoke command.",
          cwd: projectRoot,
        },
      });
      const hookResult = await input.beforeSubmitTurn?.({
        runtime: created.runtime,
        submitTurn,
      });
      const result = hookResult?.result ?? await submitTurn();
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
      const providerRoundTrip = {
        toolOutputFedBack: toolResultInput !== undefined,
        callId: stringValue(toolResultInput?.call_id),
        outputIncludesStdout: toolResultOutput.includes("application-shell-ok"),
        secondProviderInputItems: secondProviderInput.length,
      };
      const toolExposure = providerToolExposure(providerBodies[0], "praxis_tool_shell_run");
      const toolEvent = {
        toolId: stringValue(toolMetadata.toolId),
        toolStatus: stringValue(toolMetadata.toolStatus),
        sandboxMode: stringValue(resultMetadata.sandboxMode),
        sandboxPlanStatus: stringValue(resultMetadata.sandboxPlanStatus),
        commandSandboxProviderFamily: stringValue(resultMetadata.commandSandboxProviderFamily),
        commandSandboxMode: stringValue(resultMetadata.commandSandboxMode),
        commandSandboxApplied: booleanValue(resultMetadata.commandSandboxApplied),
        policyProfile: stringValue(resultMetadata.policyProfile),
      };
      const eventNames = [...new Set(events.map(eventSummary))];
      return {
        status: result.ok &&
          view.status === "completed" &&
          view.finalOutput === finalOutputText &&
          view.counters.turns === 1 &&
          view.counters.modelCalls === 2 &&
          view.counters.toolCalls === 1 &&
          providerCalls === 2 &&
          providerRoundTrip.toolOutputFedBack &&
          providerRoundTrip.callId === "application-kernel-shell-call" &&
          providerRoundTrip.outputIncludesStdout &&
          toolExposure.exposesExpectedTool &&
          toolEvent.toolId === "shell.run" &&
          toolEvent.toolStatus === "completed" &&
          toolEvent.sandboxMode === "workspace-rollback" &&
          toolEvent.commandSandboxProviderFamily === "workspace-rollback" &&
          toolEvent.commandSandboxMode === "workspace-rollback" &&
          toolEvent.commandSandboxApplied === true &&
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
        toolEvent,
        events: eventNames,
        retainedEvents: view.events,
        output: hookResult?.output,
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
  const result = await runApplicationKernelShellSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
