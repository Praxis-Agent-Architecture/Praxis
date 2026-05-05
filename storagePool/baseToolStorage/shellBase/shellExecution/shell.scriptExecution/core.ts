/*
 * 文件定位：storagePool / baseToolStorage / shell.scriptExecution core。
 * 核心目的：把脚本执行做成 runtime-governed shell 原语，兼容旧 dry-run 计划并支持真实 provider 调用。
 */

import type {
  ShellCommandExecutionErrorCode,
  ShellExecutionBoundary,
  ShellExecutionContext,
  ShellToolAuditEvent,
  ShellToolContext,
  ShellToolResult,
} from "../shell.commandExecution/core.js";

export type ShellScriptLanguage = "sh" | "bash" | "zsh" | "fish" | "powershell" | "unknown";

export type ShellScriptExecutionProviderRequest = {
  script: string;
  language: ShellScriptLanguage;
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  stdin?: string;
};

export type ShellScriptExecutionProviderResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ShellScriptExecutionProvider = (
  request: ShellScriptExecutionProviderRequest,
  context: ShellToolContext,
) => ShellScriptExecutionProviderResult | Promise<ShellScriptExecutionProviderResult>;

export type ShellScriptExecutionRequest = {
  context?: ShellExecutionContext;
  script?: string;
  language?: ShellScriptLanguage;
  cwd?: string;
  timeoutMs?: number;
  stdin?: string;
  provider?: ShellScriptExecutionProvider;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellScriptExecutionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SCRIPT"
  | "INVALID_SCRIPT"
  | "INVALID_LANGUAGE"
  | "SCRIPT_TOO_LARGE"
  | "INVALID_CWD"
  | "INVALID_TIMEOUT"
  | "INVALID_STDIN"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SCRIPT_EXECUTION_NOT_ALLOWED"
  | ShellCommandExecutionErrorCode;

export type ShellScriptExecutionError = {
  code: ShellScriptExecutionErrorCode;
  message: string;
  boundary: ShellExecutionBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type ShellScriptExecutionPlan = {
  toolId: "shell.scriptExecution";
  capability: "execute-script";
  runtimeId: string;
  invocationId: string;
  language: ShellScriptLanguage;
  cwd?: string;
  timeoutMs: number;
  scriptPreview: string;
  scriptLineCount: number;
  scriptBytes: number;
  requiredPermissions: readonly ["shell:script:dry-run"];
  requiresTapApproval: true;
  dispatch: "dry-run";
  dryRun: true;
  wouldSpawnProcess: true;
  wouldWriteTempScript: false;
  unsafeSideEffects: false;
  acceptedScopes: readonly string[];
  outputEnvelope: {
    exitCode?: number;
    stdoutPreview: "";
    stderrPreview: "";
    started: false;
  };
  audit: {
    guard: "shell-script-dry-run-approval";
    event: "basicTool.shell.scriptExecution.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type ShellScriptExecutionResult =
  | {
      ok: true;
      plan: ShellScriptExecutionPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ShellScriptExecutionError;
      events: readonly string[];
    };

export type ShellScriptExecutionOutput = {
  kind: "agentCore.basicTool.shell.scriptExecution";
  invocationId: string;
  scriptPreview: string;
  scriptLineCount: number;
  scriptBytes: number;
  language: ShellScriptLanguage;
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  dryRun: boolean;
  providerCalled: boolean;
  exitCode?: number;
  stdout: string;
  stderr: string;
  permissionsRequired: readonly ["shell:execute"];
  unsafeSideEffects: false;
};

type NormalizedShellScriptExecution = {
  runtimeId: string;
  invocationId: string;
  script: string;
  language: ShellScriptLanguage;
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  stdin?: string;
  acceptedScopes: readonly string[];
};

export const shellScriptExecutionDescriptor = {
  toolId: "shell.scriptExecution",
  capability: "execute-script",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  defaultLanguage: "sh",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  maxScriptBytes: 65_536,
  permissionsRequired: ["shell:execute"],
  unsafeSideEffects: false,
  requiresTapApproval: true,
  tapOwnsApproval: true,
} as const;

type ShellScriptExecutionFailure = Extract<ShellScriptExecutionResult, { ok: false }>;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => stringValue(value)?.trim() ?? "").filter(Boolean))];
}

function dryRunEnabled(context: ShellToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function guardRejected(context: ShellToolContext | undefined): boolean {
  return context?.guard?.accepted === false || context?.guard?.allowed === false;
}

function guardAllowsRealExecution(context: ShellToolContext | undefined): boolean {
  return context?.guard?.allowed === true || context?.guard?.accepted === true;
}

function auditEvent(
  type: string,
  context: ShellToolContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): ShellToolAuditEvent {
  return {
    type,
    toolId: shellScriptExecutionDescriptor.toolId,
    invocationId: stringValue(context?.invocationId)?.trim() || `${shellScriptExecutionDescriptor.toolId}:dry-run`,
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function failure(
  code: ShellScriptExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
): ShellScriptExecutionFailure {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["basicTool.shell.scriptExecution.rejected"],
  };
}

function toolFailure(
  code: ShellScriptExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
  context?: ShellToolContext,
): Extract<ShellToolResult<ShellScriptExecutionOutput, ShellScriptExecutionErrorCode>, { ok: false }> {
  return {
    ok: false,
    toolId: shellScriptExecutionDescriptor.toolId,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    audit: [auditEvent("agentCore.basicTool.shell.scriptExecution.rejected", context, { code, boundary })],
    events: ["basicTool.shell.scriptExecution.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellScriptExecutionFailure {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);
  const denied = requested.filter((scope) => !allowed.includes(scope));

  if (denied.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `shell.scriptExecution scope ${denied[0]} is outside runtime governance`,
      "scope",
    );
  }

  return requested;
}

function normalizeScript(value: unknown): string | ShellScriptExecutionFailure {
  if (isBlank(value)) {
    return failure("MISSING_SCRIPT", "shell.scriptExecution requires script", "input");
  }

  const script = stringValue(value) ?? "";
  if (script.includes("\0")) {
    return failure("INVALID_SCRIPT", "shell.scriptExecution script must be a safe string", "input");
  }

  if (Buffer.byteLength(script, "utf8") > shellScriptExecutionDescriptor.maxScriptBytes) {
    return failure("SCRIPT_TOO_LARGE", "shell.scriptExecution script exceeds first-round resource limits", "resource");
  }

  return script;
}

function normalizeLanguage(value: unknown): ShellScriptLanguage | ShellScriptExecutionFailure {
  if (value !== undefined && typeof value !== "string") {
    return failure("INVALID_LANGUAGE", "shell.scriptExecution language is not supported", "input");
  }

  const language = value ?? shellScriptExecutionDescriptor.defaultLanguage;
  if (!["sh", "bash", "zsh", "fish", "powershell", "unknown"].includes(language)) {
    return failure("INVALID_LANGUAGE", "shell.scriptExecution language is not supported", "input");
  }

  return language as ShellScriptLanguage;
}

function normalizeCwd(value: unknown): string | ShellScriptExecutionFailure | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return failure("INVALID_CWD", "shell.scriptExecution cwd must be a safe path string", "input");
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "shell.scriptExecution cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizeTimeout(value: unknown): number | ShellScriptExecutionFailure {
  if (value !== undefined && typeof value !== "number") {
    return failure("INVALID_TIMEOUT", "shell.scriptExecution timeoutMs must be between 1 and 600000", "resource");
  }

  const timeoutMs = value ?? shellScriptExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellScriptExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.scriptExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

function normalizeStdin(value: unknown): string | ShellScriptExecutionFailure | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.includes("\0")) {
    return failure("INVALID_STDIN", "shell.scriptExecution stdin must be a safe string", "input");
  }

  return value;
}

function previewScript(script: string): string {
  const compact = script.replace(/\s+/gu, " ").trim();
  return compact.length <= 160 ? compact : compact.slice(0, 157) + "...";
}

function scriptCommand(language: ShellScriptLanguage, script: string): { command: string; args: readonly string[] } {
  if (language === "powershell") {
    return { command: "pwsh", args: ["-NoProfile", "-Command", script] };
  }

  const command = language === "unknown" ? "sh" : language;
  return { command, args: ["-c", script] };
}

function normalizeShellScriptExecution(
  request: ShellScriptExecutionRequest,
): NormalizedShellScriptExecution | ShellScriptExecutionFailure {
  const runtimeId = stringValue(request.context?.runtimeId)?.trim() ?? "";
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.scriptExecution requires context.runtimeId for audit", "input");
  }

  if (guardRejected(request.context)) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context?.guard?.reason ?? "shell.scriptExecution was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.context?.requestedScopes, request.context?.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const script = normalizeScript(request.script);
  if (typeof script !== "string") {
    return script;
  }

  const language = normalizeLanguage(request.language);
  if (typeof language !== "string") {
    return language;
  }

  const cwd = normalizeCwd(request.cwd);
  if (cwd !== undefined && typeof cwd !== "string") {
    return cwd;
  }

  const timeoutMs = normalizeTimeout(request.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  const stdin = normalizeStdin(request.stdin);
  if (stdin !== undefined && typeof stdin !== "string") {
    return stdin;
  }

  const invocationId = stringValue(request.context?.invocationId)?.trim() || `${runtimeId}:shell.scriptExecution:${language}`;
  const command = scriptCommand(language, script);

  return {
    runtimeId,
    invocationId,
    script,
    language,
    command: command.command,
    args: command.args,
    cwd,
    timeoutMs,
    stdin,
    acceptedScopes,
  };
}

function isScriptExecutionFailure(
  value: NormalizedShellScriptExecution | ShellScriptExecutionFailure,
): value is ShellScriptExecutionFailure {
  return "ok" in value && !value.ok;
}

export function planShellScriptExecution(request: ShellScriptExecutionRequest = {}): ShellScriptExecutionResult {
  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SCRIPT_EXECUTION_NOT_ALLOWED",
      "first-round shell.scriptExecution only creates a dry-run script plan",
      "contract",
    );
  }

  const normalized = normalizeShellScriptExecution({
    ...request,
    context: {
      ...request.context,
      dryRun: true,
    },
  });
  if (isScriptExecutionFailure(normalized)) {
    return normalized;
  }

  return {
    ok: true,
    plan: {
      toolId: "shell.scriptExecution",
      capability: "execute-script",
      runtimeId: normalized.runtimeId,
      invocationId: normalized.invocationId,
      language: normalized.language,
      cwd: normalized.cwd,
      timeoutMs: normalized.timeoutMs,
      scriptPreview: previewScript(normalized.script),
      scriptLineCount: normalized.script.split(/\r?\n/u).length,
      scriptBytes: Buffer.byteLength(normalized.script, "utf8"),
      requiredPermissions: ["shell:script:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      wouldWriteTempScript: false,
      unsafeSideEffects: false,
      acceptedScopes: normalized.acceptedScopes,
      outputEnvelope: {
        stdoutPreview: "",
        stderrPreview: "",
        started: false,
      },
      audit: {
        guard: "shell-script-dry-run-approval",
        event: "basicTool.shell.scriptExecution.planned",
        metadata: {
          ...(request.context?.auditMetadata ?? {}),
          ...(request.metadata ?? {}),
        },
      },
    },
    events: ["basicTool.shell.scriptExecution.planned"],
  };
}

function dryRunOutput(normalized: NormalizedShellScriptExecution): ShellScriptExecutionOutput {
  return {
    kind: "agentCore.basicTool.shell.scriptExecution",
    invocationId: normalized.invocationId,
    scriptPreview: previewScript(normalized.script),
    scriptLineCount: normalized.script.split(/\r?\n/u).length,
    scriptBytes: Buffer.byteLength(normalized.script, "utf8"),
    language: normalized.language,
    command: normalized.command,
    args: normalized.args,
    cwd: normalized.cwd,
    timeoutMs: normalized.timeoutMs,
    dryRun: true,
    providerCalled: false,
    stdout: "",
    stderr: "",
    permissionsRequired: shellScriptExecutionDescriptor.permissionsRequired,
    unsafeSideEffects: false,
  };
}

export async function executeShellScript(
  request: ShellScriptExecutionRequest = {},
): Promise<ShellToolResult<ShellScriptExecutionOutput, ShellScriptExecutionErrorCode>> {
  const normalized = normalizeShellScriptExecution(request);
  if (isScriptExecutionFailure(normalized)) {
    return toolFailure(normalized.error.code, normalized.error.message, normalized.error.boundary, request.context);
  }

  if (dryRunEnabled(request.context)) {
    return {
      ok: true,
      toolId: shellScriptExecutionDescriptor.toolId,
      output: dryRunOutput(normalized),
      audit: [
        auditEvent("agentCore.basicTool.shell.scriptExecution.dryRun", request.context, {
          language: normalized.language,
          timeoutMs: normalized.timeoutMs,
        }),
      ],
      events: ["basicTool.shell.scriptExecution.dryRun"],
    };
  }

  if (!guardAllowsRealExecution(request.context)) {
    return toolFailure(
      "GOVERNANCE_REJECTED",
      "shell.scriptExecution requires an allowed runtime governance guard when dryRun is false",
      "governance",
      request.context,
    );
  }

  if (request.provider === undefined) {
    return toolFailure(
      "PROVIDER_UNAVAILABLE",
      "shell.scriptExecution requires a runtime-provided shell executor when dryRun is false",
      "provider",
      request.context,
    );
  }

  try {
    const providerResult = await request.provider(
      {
        script: normalized.script,
        language: normalized.language,
        command: normalized.command,
        args: normalized.args,
        cwd: normalized.cwd,
        timeoutMs: normalized.timeoutMs,
        stdin: normalized.stdin,
      },
      request.context ?? {},
    );

    return {
      ok: true,
      toolId: shellScriptExecutionDescriptor.toolId,
      output: {
        kind: "agentCore.basicTool.shell.scriptExecution",
        invocationId: normalized.invocationId,
        scriptPreview: previewScript(normalized.script),
        scriptLineCount: normalized.script.split(/\r?\n/u).length,
        scriptBytes: Buffer.byteLength(normalized.script, "utf8"),
        language: normalized.language,
        command: normalized.command,
        args: normalized.args,
        cwd: normalized.cwd,
        timeoutMs: normalized.timeoutMs,
        dryRun: false,
        providerCalled: true,
        exitCode: providerResult.exitCode,
        stdout: providerResult.stdout,
        stderr: providerResult.stderr,
        permissionsRequired: shellScriptExecutionDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.shell.scriptExecution.provider", request.context, {
          language: normalized.language,
          exitCode: providerResult.exitCode,
        }),
      ],
      events: ["basicTool.shell.scriptExecution.providerCalled"],
    };
  } catch (error) {
    return toolFailure(
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "shell.scriptExecution provider rejected the invocation",
      "provider",
      request.context,
    );
  }
}
