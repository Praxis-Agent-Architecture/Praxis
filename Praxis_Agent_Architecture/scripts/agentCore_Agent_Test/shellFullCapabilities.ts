import { spawn } from "node:child_process";
import path from "node:path";

import type {
  BaseToolExecutorPort,
  BaseToolExecutorResult,
} from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import { adaptRuntimeToolInvocation } from "../../src/agentCore/agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import { bridgeExecEngineInvocation } from "../../src/agentCore/agent_runtimeImplementation/runtime.execEngine/execEngineInvocationBridge.js";

export type ShellLiveToolCall = {
  tool: string;
  arguments: Readonly<Record<string, unknown>>;
};

export type ShellLiveRuntimeContext = {
  runtimeId: string;
  applicationId: string;
  sessionId: string;
};

export type ShellLiveToolCase = {
  toolId: string;
  userPrompt: string;
  input: Readonly<Record<string, unknown>>;
  expectedCall: string | RegExp;
};

export type ShellLiveInvocationResult = {
  ok: boolean;
  toolId: string;
  output?: unknown;
  error?: { code: string; message?: string; publicSafe: true };
  events?: readonly string[];
  calls: readonly string[];
};

const realContext = { dryRun: false, guard: { allowed: true, reason: "agentCore live shell matrix" } } as const;
const observeContext = { ...realContext, grantedPermissions: ["shell:observe"] } as const;
const sessionContext = {
  ...realContext,
  grantedPermissions: ["shell:execution:monitor", "shell:output:capture", "shell:interactive:control", "shell:prompt:handle", "shell:stdin:feed"],
  allowedSessionIds: ["shell-session-1"],
} as const;

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
} as const;

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
} as const;

export const shellLiveToolCases: readonly ShellLiveToolCase[] = [
  { toolId: "shell.argumentAssembly", userPrompt: "调用 shell.argumentAssembly 组装 printf ok 参数。", input: { executable: "printf", context: realContext }, expectedCall: "assembleArguments" },
  { toolId: "shell.commandGeneration", userPrompt: "调用 shell.commandGeneration 生成 printf ok 命令。", input: { argv: ["printf", "ok"], context: realContext }, expectedCall: "generateCommand" },
  { toolId: "shell.executionGuard", userPrompt: "调用 shell.executionGuard 为 printf ok 生成执行守卫。", input: { command: "printf ok", context: realContext }, expectedCall: "buildExecutionGuard" },
  {
    toolId: "shell.invocationConstruction",
    userPrompt: "调用 shell.invocationConstruction 构造一次 printf ok invocation。",
    input: { generatedCommand, executionGuard, context: realContext },
    expectedCall: "constructInvocation",
  },
  { toolId: "shell.scriptGeneration", userPrompt: "调用 shell.scriptGeneration 生成 printf ok 脚本。", input: { target: { commands: ["printf ok"] }, context: realContext }, expectedCall: "generateScript" },
  {
    toolId: "shell.commandValidation",
    userPrompt: "调用 shell.commandValidation 验证 printf ok。",
    input: { command: "printf ok", context: { ...realContext, grantedPermissions: ["shell:validate"] } },
    expectedCall: "validateCommand",
  },
  {
    toolId: "shell.permissionControl",
    userPrompt: "调用 shell.permissionControl 审批 shell:execute 权限。",
    input: { command: "printf ok", requestedPermissions: ["shell:execute"], riskLevel: "low", context: { ...realContext, grantedPermissions: ["shell:execute"] } },
    expectedCall: "controlPermission",
  },
  {
    toolId: "shell.sandboxEnforcement",
    userPrompt: "调用 shell.sandboxEnforcement 检查 /repo 读权限是否在沙箱内。",
    input: { command: "printf ok", workingDirectory: "/repo", requestedPaths: ["/repo"], accessIntents: ["read"], policy: { sandboxRoots: ["/repo"] }, context: { ...realContext, grantedPermissions: ["shell:sandbox"] } },
    expectedCall: "enforceSandbox",
  },
  { toolId: "shell.capabilityDetection", userPrompt: "调用 shell.capabilityDetection 检测 bash 能力。", input: { target: { shellExecutable: "bash", requestedCapabilities: ["command-execution", "script-execution"] }, context: realContext }, expectedCall: /^run:bash$/u },
  { toolId: "shell.environmentInspection", userPrompt: "调用 shell.environmentInspection 检查当前工作目录环境。", input: { target: { workingDirectory: ".", variablesToInspect: ["PATH"] }, context: realContext }, expectedCall: /^run:env$/u },
  { toolId: "shell.sessionDetection", userPrompt: "调用 shell.sessionDetection 检测一个 shell session。", input: { target: { shellExecutable: "bash", tty: "/dev/pts/1" }, context: realContext }, expectedCall: /^run:bash$/u },
  { toolId: "shell.typeDetection", userPrompt: "调用 shell.typeDetection 识别 bash 类型。", input: { executableName: "bash", context: realContext }, expectedCall: /^run:bash$/u },
  { toolId: "shell.commandExecution", userPrompt: "调用 shell.commandExecution 执行 printf ok。", input: { command: "printf", args: ["ok"], context: realContext }, expectedCall: /^run:printf$/u },
  { toolId: "shell.invocationExecution", userPrompt: "调用 shell.invocationExecution 执行 printf ok invocation。", input: { invocation: { executable: "printf", args: ["ok"] }, context: realContext }, expectedCall: /^run:printf$/u },
  { toolId: "shell.scriptExecution", userPrompt: "调用 shell.scriptExecution 执行 printf ok 脚本。", input: { script: "printf ok", language: "sh", context: realContext }, expectedCall: /^run:sh$/u },
  { toolId: "shell.backgroundExecution", userPrompt: "调用 shell.backgroundExecution 启动一个 runtime-owned background job。", input: { target: { command: "printf ok" }, context: realContext }, expectedCall: "startBackground" },
  { toolId: "shell.detachedExecution", userPrompt: "调用 shell.detachedExecution 启动一个 runtime-owned detached job。", input: { target: { command: "printf ok" }, context: { ...realContext, approval: { accepted: true } } }, expectedCall: "startDetached" },
  { toolId: "shell.foregroundExecution", userPrompt: "调用 shell.foregroundExecution 前台执行 printf ok。", input: { target: { command: "printf ok" }, context: realContext }, expectedCall: /^run:sh$/u },
  { toolId: "shell.processSpawning", userPrompt: "调用 shell.processSpawning 生成一个 node --version 进程计划。", input: { target: { executable: "node", args: ["--version"] }, context: realContext }, expectedCall: "spawnProcess:foreground" },
  { toolId: "shell.processTermination", userPrompt: "调用 shell.processTermination 终止测试进程 304。", input: { target: { processId: 304, signal: "SIGTERM" }, context: realContext }, expectedCall: "terminateProcess" },
  { toolId: "shell.exitCodeChecking", userPrompt: "调用 shell.exitCodeChecking 检查 exec-1 退出码。", input: { executionId: "exec-1", context: observeContext }, expectedCall: "monitorExecution" },
  { toolId: "shell.processStatusTracking", userPrompt: "调用 shell.processStatusTracking 跟踪进程 304。", input: { executionId: "exec-1", target: { processId: 304 }, context: observeContext }, expectedCall: "monitorExecution" },
  { toolId: "shell.runtimeObservation", userPrompt: "调用 shell.runtimeObservation 观察 exec-1 runtime 事件。", input: { executionId: "exec-1", context: observeContext }, expectedCall: "monitorExecution" },
  { toolId: "shell.executionMonitoring", userPrompt: "调用 shell.executionMonitoring 监控 shell-session-1。", input: { target: { sessionId: "shell-session-1" }, context: sessionContext }, expectedCall: "monitorExecution" },
  { toolId: "shell.outputCapture", userPrompt: "调用 shell.outputCapture 捕获 shell-session-1 输出。", input: { target: { sessionId: "shell-session-1" }, context: sessionContext }, expectedCall: "captureOutput" },
  { toolId: "shell.interactiveControl", userPrompt: "调用 shell.interactiveControl 给 shell-session-1 发送输入。", input: { target: { sessionId: "shell-session-1", action: "send-input", input: "ok" }, context: sessionContext }, expectedCall: "controlInteractive" },
  { toolId: "shell.promptHandling", userPrompt: "调用 shell.promptHandling 观察 shell-session-1 prompt。", input: { target: { sessionId: "shell-session-1", promptText: "Continue?", action: "observe" }, context: sessionContext }, expectedCall: "handlePrompt" },
  { toolId: "shell.stdinFeeding", userPrompt: "调用 shell.stdinFeeding 向 shell-session-1 写入 ok。", input: { target: { sessionId: "shell-session-1", input: "ok" }, context: sessionContext }, expectedCall: "feedStdin" },
  { toolId: "shell.shellLifecycleManagement", userPrompt: "调用 shell.shellLifecycleManagement 创建 runtime-owned shell session。", input: { target: { action: "create" }, context: realContext }, expectedCall: "manageLifecycle" },
  { toolId: "shell.shellProcessManagement", userPrompt: "调用 shell.shellProcessManagement inspect 进程 304。", input: { target: { action: "inspect", processId: 304 }, context: realContext }, expectedCall: "manageProcess" },
  { toolId: "shell.shellResourceManagement", userPrompt: "调用 shell.shellResourceManagement inspect pty 资源。", input: { target: { action: "inspect", resourceKind: "pty" }, context: realContext }, expectedCall: "manageResource" },
  { toolId: "shell.shellSessionManagement", userPrompt: "调用 shell.shellSessionManagement inspect shell-session-1。", input: { target: { action: "inspect", sessionId: "shell-session-1" }, context: realContext }, expectedCall: "manageSession" },
];

export const shellLiveToolIds = shellLiveToolCases.map((testCase) => testCase.toolId);

function publicShellError(code: string, message: string) {
  return {
    ok: false as const,
    error: { code, message, publicSafe: true as const },
  };
}

function safeStringArray(values: readonly string[] | undefined): readonly string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length > 40) return undefined;
  return values.every((value) => typeof value === "string" && !value.includes("\0") && value.length <= 10_000) ? values : undefined;
}

function validateHarmlessCommand(command: string, args: readonly string[]): string | undefined {
  const allowed = new Set(["pwd", "printf", "echo", "ls", "date", "whoami", "uname", "git", "node", "sh", "bash", "env"]);
  if (!allowed.has(command)) return `chat live shell only allows harmless commands; rejected ${command}`;

  if (command === "git") {
    const subcommand = args[0] ?? "status";
    const allowedGit = new Set(["status", "diff", "branch", "log", "rev-parse", "show", "ls-files"]);
    if (!allowedGit.has(subcommand)) return `chat live shell only allows read-only git commands; rejected git ${subcommand}`;
  }

  if ((command === "sh" || command === "bash") && args.some((arg) => /\brm\b/u.test(arg) || /\bsudo\b/u.test(arg))) {
    return "chat live shell rejects unsafe script material";
  }

  for (const arg of args) {
    if (arg.includes("\0") || arg.includes("\n") && command !== "sh" && command !== "bash") return "chat live shell rejects unsafe arguments";
  }

  return undefined;
}

function resolveSafeCwd(workspaceRoot: string, cwd: string | undefined): string | undefined {
  const resolved = path.resolve(workspaceRoot, cwd ?? ".");
  if (resolved !== workspaceRoot && !resolved.startsWith(`${workspaceRoot}${path.sep}`)) return undefined;
  return resolved;
}

async function runHarmlessCommand(
  workspaceRoot: string,
  calls: string[],
  request: { command: string; args?: readonly string[]; cwd?: string; timeoutMs?: number; stdin?: string },
): Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>> {
  const args = safeStringArray(request.args);
  if (args === undefined && request.args !== undefined) return publicShellError("INVALID_ARGUMENT", "shell args must be a small array of safe strings");

  const command = request.command.trim();
  const commandArgs = args ?? [];
  calls.push(`run:${command}`);
  const rejected = validateHarmlessCommand(command, commandArgs);
  if (rejected !== undefined) return publicShellError("GOVERNANCE_REJECTED", rejected);

  const cwd = resolveSafeCwd(workspaceRoot, request.cwd);
  if (cwd === undefined) return publicShellError("INVALID_CWD", "cwd must stay inside the Praxis_Agent_Architecture workspace");

  const timeoutMs = Math.min(Math.max(request.timeoutMs ?? 10_000, 1), 30_000);

  return await new Promise<BaseToolExecutorResult<{ exitCode: number; stdout: string; stderr: string }>>((resolve) => {
    const child = spawn(command, commandArgs, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: Parameters<typeof resolve>[0]) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(publicShellError("TIMEOUT", `command exceeded ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-20_000);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-20_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(publicShellError("SPAWN_FAILED", error.message));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      finish({ ok: true, output: { exitCode: exitCode ?? 0, stdout, stderr }, events: ["agentcore.chat.shell.completed"] });
    });

    if (request.stdin !== undefined) child.stdin?.write(request.stdin);
    child.stdin?.end();
  });
}

export function createFullShellExecutor(workspaceRoot: string, calls: string[] = []): BaseToolExecutorPort {
  return {
    shell: {
      async assembleArguments(request) {
        calls.push("assembleArguments");
        return { ok: true, output: { kind: "agentCore.basicTool.shell.argumentAssembly", executable: String(request.input.executable ?? "printf"), argv: ["printf", "ok"], renderedTokens: [], redactedPreview: ["printf", "ok"], requiredPermission: "shell:generate", dryRun: false, providerCalled: true, executionBlocked: true, unsafeSideEffects: false } };
      },
      async generateCommand() {
        calls.push("generateCommand");
        return { ok: true, output: { kind: "agentCore.basicTool.shell.commandGeneration", shell: "bash", commandLine: "printf ok", argv: ["printf", "ok"], executable: "printf", environmentKeys: [], requiredPermission: "shell:generate", dryRun: false, providerCalled: true, executionBlocked: true, unsafeSideEffects: false } };
      },
      async buildExecutionGuard() {
        calls.push("buildExecutionGuard");
        return { ok: true, output: { kind: "agentCore.basicTool.shell.executionGuard", command: "printf ok", argv: ["printf", "ok"], verdict: "allowed", reasons: ["runtime provider allowed generated command"], requiredPermissions: ["shell:generate"], requiresTapApproval: false, dryRun: false, providerCalled: true, executionBlocked: true, unsafeSideEffects: false } };
      },
      async constructInvocation() {
        calls.push("constructInvocation");
        return { ok: true, output: { kind: "agentCore.basicTool.shell.invocation", invocationId: "runtime-invocation", runtimeId: "runtime-1", sessionId: "session-1", shell: "bash", commandLine: "printf ok", argv: ["printf", "ok"], executable: "printf", environmentKeys: [], guardVerdict: "allowed", approvalRequired: false, status: "planned", metadata: {}, dryRun: false, providerCalled: true, executionBlocked: true, unsafeSideEffects: false } };
      },
      async generateScript() {
        calls.push("generateScript");
        return { ok: true, output: { kind: "agentCore.basicTool.shell.scriptGeneration", target: { shell: "bash", commands: ["printf ok"] }, script: "#!/usr/bin/env bash\nprintf ok\n", commandPreview: ["printf ok"], lineCount: 2, requiredPermission: "shell:script:generate", requiresTapApproval: false, dryRun: false, providerCalled: true, executionBlocked: true, unsafeSideEffects: false } };
      },
      async validateCommand(request) {
        calls.push("validateCommand");
        return { ok: true, output: { command: request.command, shell: request.shell, verdict: "allowed", riskLevel: "low", reasons: ["harmless test command"], requestedPermissions: ["shell:validate"], requiresTapApproval: false } };
      },
      async controlPermission(request) {
        calls.push("controlPermission");
        return { ok: true, output: { command: request.command, workingDirectory: request.workingDirectory, requestedPermissions: request.requestedPermissions, riskLevel: request.riskLevel, permissionDecision: "granted", reasons: ["runtime granted test permission"] } };
      },
      async enforceSandbox(request) {
        calls.push("enforceSandbox");
        return { ok: true, output: { command: request.command, workingDirectory: request.workingDirectory, sandboxRoots: request.policy?.sandboxRoots ?? [request.workingDirectory], requestedPaths: request.requestedPaths, accessIntents: request.accessIntents, sandboxDecision: "inside-sandbox" } };
      },
      run: (request) => runHarmlessCommand(workspaceRoot, calls, request),
      async spawnProcess(request) {
        calls.push(`spawnProcess:${request.launchMode}`);
        return { ok: true, output: { spawnHandle: `spawn:${request.launchMode}`, pid: 301, launchMode: request.launchMode } };
      },
      async startBackground(request) {
        calls.push("startBackground");
        return { ok: true, output: { backgroundHandle: request.jobId, pid: 302, command: request.command } };
      },
      async startDetached(request) {
        calls.push("startDetached");
        return { ok: true, output: { detachedHandle: request.launchId, pid: 303, command: request.command } };
      },
      async terminateProcess(request) {
        calls.push("terminateProcess");
        return { ok: true, output: { processId: request.processId, signal: request.signal, force: request.force } };
      },
      async monitorExecution(request) {
        calls.push("monitorExecution");
        if (request.target.toolId === "shell.exitCodeChecking") return { ok: true, output: { exitCode: 0 } };
        if (request.target.toolId === "shell.runtimeObservation") return { ok: true, output: { events: [{ type: "stdout", severity: "info", text: "ok" }] } };
        return { ok: true, output: { target: { ...request.target, processId: 304 }, observation: { state: "running", observedAtMs: 100, lastActivityAtMs: 100, stdoutBytes: 2, stderrBytes: 0 }, events: [{ type: "stdout", severity: "info", text: "ok" }], health: "healthy", realProcessReadBlocked: false } };
      },
      async captureOutput(request) {
        calls.push("captureOutput");
        return { ok: true, output: { sessionId: String(request.target.sessionId ?? "shell-session-1"), streams: ["stdout"], chunks: [{ stream: "stdout", text: "ok", bytes: 2 }], totalBytes: 2, truncated: false, realBufferReadBlocked: false } };
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

export function shellToolCallFromCase(testCase: ShellLiveToolCase): ShellLiveToolCall {
  return { tool: testCase.toolId, arguments: testCase.input };
}

export function normalizeShellLiveToolCall(value: unknown): ShellLiveToolCall | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const rawCalls = record.tool_calls ?? record.toolCalls;
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) return undefined;
  const first = rawCalls[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) return undefined;
  const callRecord = first as Record<string, unknown>;
  const tool = typeof callRecord.tool === "string" ? callRecord.tool : typeof callRecord.name === "string" ? callRecord.name : "";
  const rawArguments = callRecord.arguments ?? callRecord.input;
  if (!tool.startsWith("shell.") || typeof rawArguments !== "object" || rawArguments === null || Array.isArray(rawArguments)) return undefined;
  return { tool, arguments: rawArguments as Readonly<Record<string, unknown>> };
}

export async function invokeShellToolThroughRuntimeChain(
  context: ShellLiveRuntimeContext,
  toolCall: ShellLiveToolCall,
  executor: BaseToolExecutorPort,
  calls: string[],
): Promise<ShellLiveInvocationResult> {
  const toolCallId = `${toolCall.tool}:agentcore-live:${Date.now()}`;
  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId: context.runtimeId,
      sessionId: context.sessionId,
      invocationId: toolCallId,
      requestedScopes: ["tool.execute", `tool.${toolCall.tool}`],
      allowedScopes: ["tool.execute", `tool.${toolCall.tool}`],
      auditMetadata: { script: "agentcore_shell_live_matrix" },
    },
    toolId: toolCall.tool,
    operation: toolCall.tool,
    arguments: toolCall.arguments,
    resourceLimits: { timeoutMs: 30_000, maxOutputBytes: 20_000 },
  });
  if (!adapted.ok) return { ok: false, toolId: toolCall.tool, error: adapted.error, events: ["agentcore.live.adapter.failed"], calls };

  const bridged = bridgeExecEngineInvocation({
    runtimeId: context.runtimeId,
    caller: { kind: "application", id: context.applicationId, sessionId: context.sessionId },
    invocation: { invocationId: toolCallId, kind: "tool", target: toolCall.tool, payload: adapted.invocation, auditRef: adapted.invocation.audit.event },
    runtimeReady: true,
  });
  if (!bridged.ok) return { ok: false, toolId: toolCall.tool, error: bridged.error, events: ["agentcore.live.bridge.failed"], calls };

  const lookup = createBaseToolRegistry().lookupHandler(toolCall.tool);
  if (!lookup.ok) return { ok: false, toolId: toolCall.tool, error: lookup.error, events: ["agentcore.live.registry.failed"], calls };

  const result = await lookup.handler.invoke({
    toolCallId,
    runtimeId: context.runtimeId,
    sessionId: context.sessionId,
    input: toolCall.arguments,
    executor,
    metadata: { surface: "agentcore_shell_live_matrix" },
  });

  return { ...result, calls };
}

export function expectedCallSeen(expectedCall: string | RegExp, calls: readonly string[]): boolean {
  return typeof expectedCall === "string" ? calls.includes(expectedCall) : calls.some((call) => expectedCall.test(call));
}
