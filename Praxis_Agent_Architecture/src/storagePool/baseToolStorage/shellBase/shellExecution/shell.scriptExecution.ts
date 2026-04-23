/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / Shell 基础工具 / Shell 执行。
 * 核心目的：提供 Shell 基础工具 / Shell 执行 中的“执行脚本”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { ShellExecutionBoundary, ShellExecutionContext } from "./shell.commandExecution.js";

export type ShellScriptLanguage = "sh" | "bash" | "zsh" | "fish" | "powershell" | "unknown";

export type ShellScriptExecutionRequest = {
  context?: ShellExecutionContext;
  script?: string;
  language?: ShellScriptLanguage;
  cwd?: string;
  timeoutMs?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ShellScriptExecutionErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SCRIPT"
  | "INVALID_SCRIPT"
  | "SCRIPT_TOO_LARGE"
  | "INVALID_CWD"
  | "INVALID_TIMEOUT"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_SCRIPT_EXECUTION_NOT_ALLOWED";

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

export const shellScriptExecutionDescriptor = {
  toolId: "shell.scriptExecution",
  capability: "execute-script",
  layer: "agent_executionEngine.basic_toolLayer.baseTools.shellBase.shellExecution",
  defaultDispatch: "dry-run",
  defaultLanguage: "sh",
  defaultTimeoutMs: 30_000,
  maxTimeoutMs: 600_000,
  maxScriptBytes: 65_536,
  unsafeSideEffects: false,
  requiresTapApproval: true,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: ShellScriptExecutionErrorCode,
  message: string,
  boundary: ShellExecutionBoundary,
): ShellScriptExecutionResult {
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

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | ShellScriptExecutionResult {
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

function normalizeScript(value: string | undefined): string | ShellScriptExecutionResult {
  if (isBlank(value)) {
    return failure("MISSING_SCRIPT", "shell.scriptExecution requires script", "input");
  }

  const script = value ?? "";
  if (script.includes("\0")) {
    return failure("INVALID_SCRIPT", "shell.scriptExecution script must be a safe string", "input");
  }

  if (Buffer.byteLength(script, "utf8") > shellScriptExecutionDescriptor.maxScriptBytes) {
    return failure("SCRIPT_TOO_LARGE", "shell.scriptExecution script exceeds first-round resource limits", "resource");
  }

  return script;
}

function normalizeCwd(value: string | undefined): string | ShellScriptExecutionResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cwd = value.trim();
  if (cwd.length === 0 || cwd.includes("\0")) {
    return failure("INVALID_CWD", "shell.scriptExecution cwd must be a safe path string", "input");
  }

  return cwd;
}

function normalizeTimeout(value: number | undefined): number | ShellScriptExecutionResult {
  const timeoutMs = value ?? shellScriptExecutionDescriptor.defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > shellScriptExecutionDescriptor.maxTimeoutMs) {
    return failure("INVALID_TIMEOUT", "shell.scriptExecution timeoutMs must be between 1 and 600000", "resource");
  }

  return timeoutMs;
}

function previewScript(script: string): string {
  const compact = script.replace(/\s+/gu, " ").trim();
  return compact.length <= 160 ? compact : compact.slice(0, 157) + "...";
}

export function planShellScriptExecution(request: ShellScriptExecutionRequest = {}): ShellScriptExecutionResult {
  const runtimeId = request.context?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "shell.scriptExecution requires context.runtimeId for audit", "input");
  }

  if (request.context?.dryRun === false) {
    return failure(
      "REAL_SCRIPT_EXECUTION_NOT_ALLOWED",
      "first-round shell.scriptExecution only creates a dry-run script plan",
      "contract",
    );
  }

  if (request.context?.guard?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.context.guard.reason ?? "shell.scriptExecution was rejected by runtime governance",
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

  const cwd = normalizeCwd(request.cwd);
  if (cwd !== undefined && typeof cwd !== "string") {
    return cwd;
  }

  const timeoutMs = normalizeTimeout(request.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return timeoutMs;
  }

  const language = request.language ?? shellScriptExecutionDescriptor.defaultLanguage;
  const invocationId = request.context?.invocationId?.trim() || `${runtimeId}:shell.scriptExecution:${language}`;

  return {
    ok: true,
    plan: {
      toolId: "shell.scriptExecution",
      capability: "execute-script",
      runtimeId: runtimeId ?? "",
      invocationId,
      language,
      cwd,
      timeoutMs,
      scriptPreview: previewScript(script),
      scriptLineCount: script.split(/\r?\n/u).length,
      scriptBytes: Buffer.byteLength(script, "utf8"),
      requiredPermissions: ["shell:script:dry-run"],
      requiresTapApproval: true,
      dispatch: "dry-run",
      dryRun: true,
      wouldSpawnProcess: true,
      wouldWriteTempScript: false,
      unsafeSideEffects: false,
      acceptedScopes,
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
