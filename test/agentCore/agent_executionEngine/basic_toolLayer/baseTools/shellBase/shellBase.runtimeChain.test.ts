import assert from "node:assert/strict";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../../../../../src/agentCore_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../../../../../src/agentCore_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

type ChainInvokeResult = {
  ok: boolean;
  toolId: string;
  output?: unknown;
  error?: { code: string; publicSafe: true };
};

const runtimeId = "runtime-chain-1";
const sessionId = "session-chain-1";

function createRecordingExecutor(calls: string[]): BaseToolExecutorPort {
  return {
    shell: {
      async assembleArguments(request) {
        calls.push("assembleArguments");
        assert.equal(Object.hasOwn(request.input, "executor"), false);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.argumentAssembly",
            executable: "printf",
            argv: ["printf", "ok"],
            renderedTokens: [],
            redactedPreview: ["printf", "ok"],
            requiredPermission: "shell:generate",
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async generateCommand(request) {
        calls.push("generateCommand");
        assert.equal(Object.hasOwn(request.input, "executor"), false);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.commandGeneration",
            shell: "bash",
            commandLine: "printf ok",
            argv: ["printf", "ok"],
            executable: "printf",
            environmentKeys: [],
            requiredPermission: "shell:generate",
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async buildExecutionGuard(request) {
        calls.push("buildExecutionGuard");
        assert.equal(Object.hasOwn(request.input, "executor"), false);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.executionGuard",
            command: "printf ok",
            argv: ["printf", "ok"],
            verdict: "allowed",
            reasons: ["runtime provider allowed generated command"],
            requiredPermissions: ["shell:generate"],
            requiresTapApproval: false,
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async constructInvocation(request) {
        calls.push("constructInvocation");
        assert.equal(Object.hasOwn(request.input, "executor"), false);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.invocation",
            invocationId: "runtime-invocation",
            runtimeId,
            sessionId,
            shell: "bash",
            commandLine: "printf ok",
            argv: ["printf", "ok"],
            executable: "printf",
            environmentKeys: [],
            guardVerdict: "allowed",
            approvalRequired: false,
            status: "planned",
            metadata: {},
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async generateScript(request) {
        calls.push("generateScript");
        assert.equal(Object.hasOwn(request.input, "executor"), false);
        return {
          ok: true,
          output: {
            kind: "agentCore.basicTool.shell.scriptGeneration",
            target: { shell: "bash", commands: ["printf ok"] },
            script: "#!/usr/bin/env bash\nprintf ok\n",
            commandPreview: ["printf ok"],
            lineCount: 2,
            requiredPermission: "shell:script:generate",
            requiresTapApproval: false,
            dryRun: true,
            providerCalled: false,
            executionBlocked: true,
            unsafeSideEffects: false,
          },
        };
      },
      async validateCommand(request) {
        calls.push("validateCommand");
        return {
          ok: true,
          output: {
            command: request.command,
            shell: request.shell,
            verdict: "allowed",
            riskLevel: "low",
            reasons: ["harmless test command"],
            requestedPermissions: ["shell:validate"],
            requiresTapApproval: false,
          },
        };
      },
      async controlPermission(request) {
        calls.push("controlPermission");
        return {
          ok: true,
          output: {
            command: request.command,
            workingDirectory: request.workingDirectory,
            requestedPermissions: request.requestedPermissions,
            riskLevel: request.riskLevel,
            permissionDecision: "granted",
            reasons: ["runtime granted test permission"],
          },
        };
      },
      async enforceSandbox(request) {
        calls.push("enforceSandbox");
        return {
          ok: true,
          output: {
            command: request.command,
            workingDirectory: request.workingDirectory,
            sandboxRoots: request.policy?.sandboxRoots ?? [request.workingDirectory],
            requestedPaths: request.requestedPaths,
            accessIntents: request.accessIntents,
            sandboxDecision: "inside-sandbox",
          },
        };
      },
      async run(request) {
        calls.push(`run:${request.command}`);
        return { ok: true, output: { exitCode: 0, stdout: `stdout:${request.command}:${request.args?.join(" ") ?? ""}`, stderr: "" } };
      },
      async spawnProcess(request) {
        calls.push(`spawnProcess:${request.launchMode}`);
        return { ok: true, output: { spawnHandle: `spawn:${request.launchMode}`, pid: 301, launchMode: request.launchMode } };
      },
      async startBackground(request) {
        calls.push("startBackground");
        return { ok: true, output: { backgroundHandle: request.jobId, pid: 302 } };
      },
      async startDetached(request) {
        calls.push("startDetached");
        return { ok: true, output: { detachedHandle: request.launchId, pid: 303 } };
      },
      async startServiceAndVerify(request) {
        calls.push("startServiceAndVerify");
        return {
          ok: true,
          output: {
            serviceHandle: request.start.serviceId,
            statusSnapshot: {
              handle: request.start.serviceId,
              lifecycleKind: "service",
              processState: "running",
              verificationState: "verified",
              verified: true,
            },
          },
        };
      },
      async terminateProcess(request) {
        calls.push("terminateProcess");
        return { ok: true, output: { processId: request.processId, signal: request.signal, force: request.force } };
      },
      async monitorExecution(request) {
        calls.push("monitorExecution");
        if (request.target.toolId === "shell.exitCodeChecking") {
          return { ok: true, output: { exitCode: 0 } };
        }
        if (request.target.toolId === "shell.runtimeObservation") {
          return {
            ok: true,
            output: { events: [{ type: "stdout", severity: "info", text: "ok" }] },
          };
        }
        return {
          ok: true,
          output: {
            target: { ...request.target, processId: 304 },
            observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100, stdoutBytes: 2, stderrBytes: 0 },
            events: [{ type: "stdout", severity: "info", text: "ok" }],
            health: "healthy",
            realProcessReadBlocked: false,
          },
        };
      },
      async captureOutput(request) {
        calls.push("captureOutput");
        return {
          ok: true,
          output: {
            sessionId: String(request.target.sessionId ?? "shell-session-1"),
            streams: ["stdout"],
            chunks: [{ stream: "stdout", text: "ok", bytes: 2 }],
            totalBytes: 2,
            truncated: false,
            realBufferReadBlocked: false,
          },
        };
      },
      async controlInteractive() {
        calls.push("controlInteractive");
        return { ok: true, output: { controlBlocked: false } };
      },
      async handlePrompt() {
        calls.push("handlePrompt");
        return { ok: true, output: { stdinWriteBlocked: true } };
      },
      async feedStdin() {
        calls.push("feedStdin");
        return { ok: true, output: { stdinWriteBlocked: false, resultEnvelope: { planned: false, bytesWritten: 2 } } };
      },
      async manageLifecycle() {
        calls.push("manageLifecycle");
        return { ok: true, output: { resultEnvelope: { planned: false, sessionHandle: "shell-session-1" } } };
      },
      async manageProcess() {
        calls.push("manageProcess");
        return { ok: true, output: { resultEnvelope: { observedStatus: "running" } } };
      },
      async manageResource() {
        calls.push("manageResource");
        return { ok: true, output: { resourceEnvelope: { operation: "inspect", resourceKind: "pty", allocationDelta: 0 } } };
      },
      async manageSession() {
        calls.push("manageSession");
        return { ok: true, output: { sessionEnvelope: { operation: "inspect", runtimeSessionState: "active" } } };
      },
    },
  };
}

async function invokeThroughRuntimeChain(
  toolId: string,
  input: Readonly<Record<string, unknown>>,
  executor: BaseToolExecutorPort,
): Promise<ChainInvokeResult> {
  const toolCallId = `${toolId}:runtime-chain`;
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolId}`],
      allowedScopes: ["tool.execute", `tool.${toolId}`],
      auditMetadata: { test: "shellBase.runtimeChain" },
    },
    toolId,
    operation: toolId,
    arguments: input,
    resourceLimits: { timeoutMs: 1000, maxOutputBytes: 8000 },
  });
  assert.equal(adapted.ok, true, `${toolId} must pass the runtime tool invocation adapter`);
  if (!adapted.ok) throw new Error(`${toolId} adapter failed`);

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: { kind: "application", id: "runtime-chain-test", sessionId },
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolId,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: true,
  });
  assert.equal(bridged.ok, true, `${toolId} must pass the execEngine invocation bridge`);
  if (!bridged.ok) throw new Error(`${toolId} bridge failed`);

  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true, `${toolId} must be mounted in the baseTool registry`);
  if (!lookup.ok) throw new Error(`${toolId} registry lookup failed`);

  return lookup.handler.invoke({ toolCallId, runtimeId, sessionId, input, executor });
}

test("shellBase runtime chain reaches every runtime-owned shell executor port through registry handlers", async () => {
  const calls: string[] = [];
  const executor = createRecordingExecutor(calls);
  const realContext = { dryRun: false, guard: { allowed: true } } as const;
  const generatedCommand = {
    kind: "agentCore.basicTool.shell.commandGeneration",
    shell: "bash",
    commandLine: "printf ok",
    argv: ["printf", "ok"],
    executable: "printf",
    environmentKeys: [],
    requiredPermission: "shell:generate",
    dryRun: false,
    providerCalled: true,
    executionBlocked: true,
    unsafeSideEffects: false,
  };
  const executionGuard = {
    kind: "agentCore.basicTool.shell.executionGuard",
    command: "printf ok",
    argv: ["printf", "ok"],
    verdict: "allowed",
    reasons: ["allowed"],
    requiredPermissions: ["shell:generate"],
    requiresTapApproval: false,
    dryRun: false,
    providerCalled: true,
    executionBlocked: true,
    unsafeSideEffects: false,
  };

  const cases: Array<{ toolId: string; input: Readonly<Record<string, unknown>>; expectedCall: string | RegExp }> = [
    { toolId: "shell.argumentAssembly", input: { executable: "printf", context: realContext }, expectedCall: "assembleArguments" },
    { toolId: "shell.commandGeneration", input: { argv: ["printf", "ok"], context: realContext }, expectedCall: "generateCommand" },
    { toolId: "shell.executionGuard", input: { command: "printf ok", context: realContext }, expectedCall: "buildExecutionGuard" },
    {
      toolId: "shell.invocationConstruction",
      input: { generatedCommand, executionGuard, context: realContext },
      expectedCall: "constructInvocation",
    },
    { toolId: "shell.scriptGeneration", input: { target: { commands: ["printf ok"] }, context: realContext }, expectedCall: "generateScript" },
    {
      toolId: "shell.commandValidation",
      input: { command: "printf ok", context: { ...realContext, grantedPermissions: ["shell:validate"] } },
      expectedCall: "validateCommand",
    },
    {
      toolId: "shell.permissionControl",
      input: {
        command: "printf ok",
        requestedPermissions: ["shell:execute"],
        riskLevel: "low",
        context: { ...realContext, grantedPermissions: ["shell:execute"] },
      },
      expectedCall: "controlPermission",
    },
    {
      toolId: "shell.sandboxEnforcement",
      input: {
        command: "printf ok",
        workingDirectory: "/repo",
        requestedPaths: ["/repo"],
        accessIntents: ["read"],
        policy: { sandboxRoots: ["/repo"] },
        context: { ...realContext, grantedPermissions: ["shell:sandbox"] },
      },
      expectedCall: "enforceSandbox",
    },
    { toolId: "shell.commandExecution", input: { command: "printf", args: ["ok"], context: realContext }, expectedCall: /^run:printf$/u },
    {
      toolId: "shell.invocationExecution",
      input: { invocation: { executable: "printf", args: ["ok"] }, context: realContext },
      expectedCall: /^run:printf$/u,
    },
    { toolId: "shell.scriptExecution", input: { script: "printf ok", language: "sh", context: realContext }, expectedCall: /^run:sh$/u },
    { toolId: "shell.backgroundExecution", input: { target: { command: "printf ok" }, context: realContext }, expectedCall: "startBackground" },
    {
      toolId: "shell.detachedExecution",
      input: { target: { command: "printf ok" }, context: { ...realContext, approval: { accepted: true } } },
      expectedCall: "startDetached",
    },
    {
      toolId: "shell.serviceStartAndVerify",
      input: {
        target: { command: "printf ok", serviceId: "service-chain", verification: { kind: "command", command: "printf ok", expectedText: "ok" } },
        context: { ...realContext, approval: { accepted: true } },
      },
      expectedCall: "startServiceAndVerify",
    },
    { toolId: "shell.foregroundExecution", input: { target: { command: "printf ok" }, context: realContext }, expectedCall: /^run:sh$/u },
    {
      toolId: "shell.processSpawning",
      input: { target: { executable: "node", args: ["--version"] }, context: realContext },
      expectedCall: "spawnProcess:foreground",
    },
    {
      toolId: "shell.processTermination",
      input: { target: { processId: 304, signal: "SIGTERM" }, context: realContext },
      expectedCall: "terminateProcess",
    },
    {
      toolId: "shell.exitCodeChecking",
      input: { executionId: "exec-1", context: { ...realContext, grantedPermissions: ["shell:observe"] } },
      expectedCall: "monitorExecution",
    },
    {
      toolId: "shell.processStatusTracking",
      input: { executionId: "exec-1", target: { processId: 304 }, context: { ...realContext, grantedPermissions: ["shell:observe"] } },
      expectedCall: "monitorExecution",
    },
    {
      toolId: "shell.runtimeObservation",
      input: { executionId: "exec-1", context: { ...realContext, grantedPermissions: ["shell:observe"] } },
      expectedCall: "monitorExecution",
    },
    {
      toolId: "shell.executionMonitoring",
      input: {
        target: { sessionId: "shell-session-1" },
        context: { ...realContext, grantedPermissions: ["shell:execution:monitor"], allowedSessionIds: ["shell-session-1"] },
      },
      expectedCall: "monitorExecution",
    },
    {
      toolId: "shell.outputCapture",
      input: {
        target: { sessionId: "shell-session-1" },
        context: { ...realContext, grantedPermissions: ["shell:output:capture"], allowedSessionIds: ["shell-session-1"] },
      },
      expectedCall: "captureOutput",
    },
    {
      toolId: "shell.interactiveControl",
      input: {
        target: { sessionId: "shell-session-1", action: "send-input", input: "ok" },
        context: { ...realContext, grantedPermissions: ["shell:interactive:control"], allowedSessionIds: ["shell-session-1"] },
      },
      expectedCall: "controlInteractive",
    },
    {
      toolId: "shell.promptHandling",
      input: {
        target: { sessionId: "shell-session-1", promptText: "Continue?", action: "observe" },
        context: { ...realContext, grantedPermissions: ["shell:prompt:handle"], allowedSessionIds: ["shell-session-1"] },
      },
      expectedCall: "handlePrompt",
    },
    {
      toolId: "shell.stdinFeeding",
      input: {
        target: { sessionId: "shell-session-1", input: "ok" },
        context: { ...realContext, grantedPermissions: ["shell:stdin:feed"], allowedSessionIds: ["shell-session-1"] },
      },
      expectedCall: "feedStdin",
    },
    { toolId: "shell.shellLifecycleManagement", input: { target: { action: "create" }, context: realContext }, expectedCall: "manageLifecycle" },
    {
      toolId: "shell.shellProcessManagement",
      input: { target: { action: "inspect", processId: 304 }, context: realContext },
      expectedCall: "manageProcess",
    },
    {
      toolId: "shell.shellResourceManagement",
      input: { target: { action: "inspect", resourceKind: "pty" }, context: realContext },
      expectedCall: "manageResource",
    },
    {
      toolId: "shell.shellSessionManagement",
      input: { target: { action: "inspect", sessionId: "shell-session-1" }, context: realContext },
      expectedCall: "manageSession",
    },
  ];

  for (const testCase of cases) {
    const before = calls.length;
    const result = await invokeThroughRuntimeChain(testCase.toolId, testCase.input, executor);
    assert.equal(result.ok, true, `${testCase.toolId} should complete through the runtime chain: ${JSON.stringify(result)}`);
    const delta = calls.slice(before);
    if (typeof testCase.expectedCall === "string") {
      assert.ok(delta.includes(testCase.expectedCall), `${testCase.toolId} should call ${testCase.expectedCall}; saw ${delta.join(", ")}`);
    } else {
      assert.ok(delta.some((call) => testCase.expectedCall instanceof RegExp && testCase.expectedCall.test(call)), `${testCase.toolId} should call ${testCase.expectedCall}; saw ${delta.join(", ")}`);
    }
  }

  for (const requiredCall of [
    "assembleArguments",
    "generateCommand",
    "buildExecutionGuard",
    "constructInvocation",
    "generateScript",
    "validateCommand",
    "controlPermission",
    "enforceSandbox",
    "startBackground",
    "startDetached",
    "startServiceAndVerify",
    "spawnProcess:foreground",
    "terminateProcess",
    "monitorExecution",
    "captureOutput",
    "controlInteractive",
    "handlePrompt",
    "feedStdin",
    "manageLifecycle",
    "manageProcess",
    "manageResource",
    "manageSession",
  ]) {
    assert.ok(calls.includes(requiredCall), `runtime chain must reach ${requiredCall}`);
  }
  assert.ok(calls.some((call) => call.startsWith("run:")), "runtime chain must reach shell.run");
});

test("shellBase runtime chain rejects missing providers and denied guards before hidden execution", async () => {
  const missingProvider = await invokeThroughRuntimeChain(
    "shell.commandExecution",
    { command: "printf", args: ["ok"], context: { dryRun: false, guard: { allowed: true } } },
    {},
  );
  assert.equal(missingProvider.ok, false);
  assert.equal(missingProvider.error?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(missingProvider.error?.publicSafe, true);

  const calls: string[] = [];
  const denied = await invokeThroughRuntimeChain(
    "shell.outputCapture",
    {
      target: { sessionId: "shell-session-1" },
      context: {
        dryRun: false,
        guard: { allowed: false },
        grantedPermissions: ["shell:output:capture"],
        allowedSessionIds: ["shell-session-1"],
      },
    },
    createRecordingExecutor(calls),
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error?.code, "GOVERNANCE_REJECTED");
  assert.equal(calls.includes("captureOutput"), false, "denied guard must reject before provider dispatch");
});
