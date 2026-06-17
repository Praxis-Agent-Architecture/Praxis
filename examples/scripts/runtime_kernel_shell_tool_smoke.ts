import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { praxis } from "@praxis-ai/praxis";

export type RuntimeKernelShellToolSmokeResult = {
  status: "ok" | "failed";
  startedAt: string;
  finishedAt: string;
  runtimeId: string;
  sessionId: string;
  finalOutput: string;
  modelCalls: number;
  providerCalls: number;
  toolCalls: {
    total: number;
    ok: number;
    toolIds: readonly string[];
  };
  shell: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    sandboxMode: string | undefined;
    sandboxDeclaredProviderFamily: string | undefined;
    sandboxPlanStatus: string | undefined;
    commandSandboxProviderFamily: string | undefined;
    commandSandboxMode: string | undefined;
    commandSandboxApplied: boolean | undefined;
  };
  providerRoundTrip: {
    toolOutputFedBack: boolean;
    callId: string | undefined;
    outputIncludesStdout: boolean;
    secondProviderInputItems: number;
  };
  session: {
    status: string | undefined;
    events: readonly string[];
    mainLoopActions: readonly string[];
    checkpointActions: readonly string[];
    invocations: {
      model: number;
      tool: number;
    };
    errors: number;
  };
};

export type RuntimeKernelShellToolSmokeInput = {
  now?: () => string;
};

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function authEnvelope() {
  const ref = praxis.modelAuth.credentialRef({
    id: "kernel-shell-smoke",
    provider: "openai",
    credentialType: "chatgpt_codex_oauth",
    source: { kind: "test", label: "kernel-shell-smoke" },
  });
  if (!ref.ok) throw new Error("Failed to create kernel shell smoke credential ref.");
  return praxis.modelAuth.chatgptCodexAuthEnvelope({
    credentialRef: ref.credentialRef,
    snapshot: {
      sourceShape: "chatgpt-auth-tokens",
      authMode: "chatgpt",
      accessToken: "kernel-shell-smoke-token",
      refreshTokenPresent: false,
      idTokenPresent: false,
      accountId: "kernel-shell-smoke-account",
      accountIsFedramp: false,
      publicSafe: false,
    },
  }).envelope;
}

class KernelShellSmokeAgent extends praxis.Agent {
  identity = "agent.example.runtimeKernelShellSmoke";
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.runtimeKernelShellSmoke",
  });
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });
  toolPolicy = praxis.toolPolicies.yolo({
    matrixId: "toolPolicy.example.runtimeKernelShellSmoke.yolo",
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
        description: "Run a governed shell command through the runtime sandbox chain.",
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

export async function runRuntimeKernelShellToolSmoke(
  input: RuntimeKernelShellToolSmokeInput = {},
): Promise<RuntimeKernelShellToolSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const runtimeId = "runtime.smoke.kernelShellTool";
  const sessionId = "session.smoke.kernelShellTool";
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praxis-kernel-shell-smoke-"));
  try {
    const store = praxis.runtime.createInMemorySessionStateEventStore();
    const executor = praxis.runtime.createBaseToolExecutorPort({
      runtimeId,
      sessionId,
      policy: {
        workspaceRoot: workspace,
        allowedRoots: [workspace],
        allowShellExecution: true,
      },
      sandboxSpec: praxis.sandbox.hostObserved(),
      policyProfile: "yolo",
    });
    let providerCalls = 0;
    const providerBodies: unknown[] = [];
    const kernel = praxis.runtime.createPraxisRuntimeKernel({ runtimeId });
    const result = await kernel.run(new KernelShellSmokeAgent(), "Run the sandboxed shell smoke command.", {
      sessionId,
      dryRun: false,
      allowProviderCall: true,
      allowToolExecution: true,
      auth: authEnvelope(),
      executor,
      store,
      storage: {
        cwd: workspace,
        initMode: "never",
      },
      providerCaller: async (envelope) => {
        providerCalls += 1;
        providerBodies.push(envelope.body);
        if (providerCalls === 1) {
          return {
            output: [{
              type: "function_call",
              name: "shell.run",
              call_id: "kernel-shell-smoke-call",
              arguments: JSON.stringify({
                command: "printf kernel-shell-ok",
                cwd: workspace,
                dryRun: false,
              }),
            }],
          };
        }
        return { output_text: "kernel shell smoke completed" };
      },
      now,
    });
    const snapshot = await store.readSession(sessionId);
    const firstToolCall = result.ok ? result.toolCalls[0] : undefined;
    const output = record(firstToolCall?.output);
    const toolMetadata = record(firstToolCall?.metadata);
    const policyEvent = snapshot.events.find((event) => {
      const payload = record(event.payload);
      return event.type === "runtime.baseTool.policy.adjudicated" && payload.toolId === "shell.run";
    });
    const sandboxPlan = record(toolMetadata.sandboxPlan ?? record(policyEvent?.payload).sandboxPlan);
    const commandSandboxPlan = record(toolMetadata.sandbox);
    const secondProviderBody = record(providerBodies[1]);
    const secondProviderInput = Array.isArray(secondProviderBody.input) ? secondProviderBody.input : [];
    const toolResultInput = secondProviderInput
      .map((item) => record(item))
      .find((item) => item.type === "function_call_output");
    const toolResultOutput = typeof toolResultInput?.output === "string" ? toolResultInput.output : "";
    const mainLoopActions = snapshot.mainLoopSteps.map((step) => step.actionPrimitive);
    const eventTypes = [...new Set(snapshot.events.map((event) => event.type))];
    const checkpointActions = snapshot.mainLoopSteps
      .filter((step) => step.status === "completed")
      .map((step) => step.actionPrimitive);
    const shell = {
      exitCode: typeof output.exitCode === "number" ? output.exitCode : null,
      stdout: typeof output.stdout === "string" ? output.stdout : "",
      stderr: typeof output.stderr === "string" ? output.stderr : "",
      sandboxMode: typeof sandboxPlan.effectiveMode === "string" ? sandboxPlan.effectiveMode : undefined,
      sandboxDeclaredProviderFamily: typeof sandboxPlan.providerFamily === "string" ? sandboxPlan.providerFamily : undefined,
      sandboxPlanStatus: typeof sandboxPlan.status === "string" ? sandboxPlan.status : undefined,
      commandSandboxProviderFamily: typeof commandSandboxPlan.providerFamily === "string" ? commandSandboxPlan.providerFamily : undefined,
      commandSandboxMode: typeof commandSandboxPlan.mode === "string" ? commandSandboxPlan.mode : undefined,
      commandSandboxApplied: typeof commandSandboxPlan.applied === "boolean" ? commandSandboxPlan.applied : undefined,
    };
    const providerRoundTrip = {
      toolOutputFedBack: toolResultInput !== undefined,
      callId: typeof toolResultInput?.call_id === "string" ? toolResultInput.call_id : undefined,
      outputIncludesStdout: toolResultOutput.includes("kernel-shell-ok"),
      secondProviderInputItems: secondProviderInput.length,
    };
    const summary: RuntimeKernelShellToolSmokeResult = {
      status: result.ok &&
        shell.exitCode === 0 &&
        shell.stdout.includes("kernel-shell-ok") &&
        shell.sandboxMode === "workspace-rollback" &&
        shell.commandSandboxProviderFamily === "workspace-rollback" &&
        shell.commandSandboxMode === "workspace-rollback" &&
        shell.commandSandboxApplied === true &&
        providerRoundTrip.toolOutputFedBack &&
        providerRoundTrip.callId === "kernel-shell-smoke-call" &&
        providerRoundTrip.outputIncludesStdout &&
        snapshot.session?.status === "completed" &&
        snapshot.invocations.some((invocation) => invocation.kind === "tool" && invocation.ok) &&
        mainLoopActions.includes("invokeBaseTool")
        ? "ok"
        : "failed",
      startedAt,
      finishedAt: now(),
      runtimeId,
      sessionId,
      finalOutput: result.ok ? result.finalOutput : result.error.message,
      modelCalls: result.ok ? result.modelCalls.length : 0,
      providerCalls,
      toolCalls: {
        total: result.ok ? result.toolCalls.length : 0,
        ok: result.ok ? result.toolCalls.filter((toolCall) => toolCall.ok).length : 0,
        toolIds: result.ok ? result.toolCalls.map((toolCall) => toolCall.toolId) : [],
      },
      shell,
      providerRoundTrip,
      session: {
        status: snapshot.session?.status,
        events: eventTypes,
        mainLoopActions,
        checkpointActions,
        invocations: {
          model: snapshot.invocations.filter((invocation) => invocation.kind === "model").length,
          tool: snapshot.invocations.filter((invocation) => invocation.kind === "tool").length,
        },
        errors: snapshot.errors.length,
      },
    };
    await store.close?.();
    return summary;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runRuntimeKernelShellToolSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}
