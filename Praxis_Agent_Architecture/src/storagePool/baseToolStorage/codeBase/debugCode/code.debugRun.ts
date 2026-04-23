/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码调试工具。
 * 核心目的：提供 代码基础工具 / 代码调试工具 中的“运行调试流程”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  planBaseToolStorageWrite,
  type BaseToolStorageGate,
  type BaseToolStoragePlan,
} from "../../../../agentCore/agent_executionEngine/basic_toolLayer/storageLogic.js";

export type CodeDebugRunBoundary = "input" | "contract" | "governance" | "scope" | "storage";

export type CodeDebugRunTargetKind = "program" | "test" | "attach" | "workspace";

export type CodeDebugRunTarget = {
  kind?: CodeDebugRunTargetKind;
  label?: string;
  entrypoint?: string;
  command?: readonly string[];
  cwd?: string;
};

export type CodeDebugBreakpoint = {
  file?: string;
  line?: number;
  condition?: string;
};

export type CodeDebugRunRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  target?: CodeDebugRunTarget;
  breakpoints?: readonly CodeDebugBreakpoint[];
  environment?: Record<string, string>;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: BaseToolStorageGate;
  governance?: BaseToolStorageGate;
};

export type CodeDebugRunErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_DEBUG_TARGET"
  | "MISSING_TARGET_LABEL"
  | "INVALID_BREAKPOINT"
  | "INVALID_ENVIRONMENT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_DEBUG_RUN_NOT_ALLOWED"
  | "STORAGE_PLAN_REJECTED";

export type CodeDebugRunError = {
  code: CodeDebugRunErrorCode;
  message: string;
  boundary: CodeDebugRunBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeDebugRunPlan = {
  toolName: "code.debugRun";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  target: {
    kind: CodeDebugRunTargetKind;
    label: string;
    entrypoint?: string;
    command: readonly string[];
    cwd?: string;
  };
  breakpoints: readonly Required<Pick<CodeDebugBreakpoint, "file" | "line">>[];
  environmentKeys: readonly string[];
  permissions: readonly ["debug:read", "debug:run"];
  execution: {
    dryRun: true;
    launched: false;
    attached: false;
    unsafeSideEffects: false;
  };
  plannedSteps: readonly string[];
  audit: {
    governanceRequired: true;
    tapHandoffReady: true;
  };
  storage: BaseToolStoragePlan;
};

export type CodeDebugRunResult =
  | {
      ok: true;
      plan: CodeDebugRunPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeDebugRunError;
      events: readonly string[];
    };

export const codeDebugRunDescriptor = {
  toolName: "code.debugRun",
  toolFamily: "codeBase.debugCode",
  purpose: "plan a debug run through a dry-run, governable tool envelope",
  dryRunOnly: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: CodeDebugRunErrorCode, message: string, boundary: CodeDebugRunBoundary): CodeDebugRunResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.code.debugRun.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeDebugRunResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `debug run scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeBreakpoints(
  breakpoints: readonly CodeDebugBreakpoint[] | undefined,
): Required<Pick<CodeDebugBreakpoint, "file" | "line">>[] | CodeDebugRunResult {
  const normalized: Required<Pick<CodeDebugBreakpoint, "file" | "line">>[] = [];

  for (const [index, breakpoint] of (breakpoints ?? []).entries()) {
    if (isBlank(breakpoint.file) || !Number.isInteger(breakpoint.line) || (breakpoint.line ?? 0) < 1) {
      return failure("INVALID_BREAKPOINT", `code.debugRun breakpoint ${index} requires file and positive line`, "input");
    }

    normalized.push({
      file: breakpoint.file?.trim() ?? "",
      line: breakpoint.line ?? 1,
    });
  }

  return normalized;
}

function normalizeCommand(command: readonly string[] | undefined): string[] {
  return cleanList(command);
}

export function planCodeDebugRun(request?: CodeDebugRunRequest): CodeDebugRunResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code.debugRun requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "code.debugRun requires sessionId", "input");
  }

  if (request.target === undefined || request.target.kind === undefined) {
    return failure("MISSING_DEBUG_TARGET", "code.debugRun requires a debug target kind", "input");
  }

  if (isBlank(request.target.label) && isBlank(request.target.entrypoint) && normalizeCommand(request.target.command).length === 0) {
    return failure("MISSING_TARGET_LABEL", "code.debugRun requires a label, entrypoint, or command", "input");
  }

  if (request.environment !== undefined && !isRecord(request.environment)) {
    return failure("INVALID_ENVIRONMENT", "code.debugRun environment must be a plain string record", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_DEBUG_RUN_NOT_ALLOWED",
      "first-round code.debugRun only plans a dry-run debug run envelope",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.debugRun was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.debugRun was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const breakpoints = normalizeBreakpoints(request.breakpoints);
  if (!Array.isArray(breakpoints)) {
    return breakpoints;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() || `${runtimeId}:${sessionId}:code.debugRun`;
  const command = normalizeCommand(request.target.command);
  const label = request.target.label?.trim() || request.target.entrypoint?.trim() || command.join(" ");
  const environmentKeys = cleanList(Object.keys(request.environment ?? {}));
  const plannedSteps = [
    "validate-debug-target",
    "prepare-breakpoints",
    "prepare-redacted-environment",
    request.target.kind === "attach" ? "plan-debug-attach" : "plan-debug-launch",
    "handoff-to-tap-governance",
  ];

  const storage = planBaseToolStorageWrite({
    runtimeId,
    sessionId,
    invocationId,
    records: [
      {
        id: `${invocationId}:run-plan`,
        kind: "result-state",
        toolName: "code.debugRun",
        invocationId,
        reuseKey: `debug-run:${request.target.kind}:${label}`,
        tags: ["code", "debug", "run"],
        payload: {
          targetKind: request.target.kind,
          label,
          command,
          breakpoints,
          environmentKeys,
          acceptedScopes,
          plannedSteps,
        },
      },
    ],
  });

  if (!storage.ok) {
    return failure("STORAGE_PLAN_REJECTED", storage.error.message, "storage");
  }

  return {
    ok: true,
    plan: {
      toolName: "code.debugRun",
      runtimeId,
      sessionId,
      invocationId,
      target: {
        kind: request.target.kind,
        label,
        entrypoint: request.target.entrypoint?.trim() || undefined,
        command,
        cwd: request.target.cwd?.trim() || undefined,
      },
      breakpoints,
      environmentKeys,
      permissions: ["debug:read", "debug:run"],
      execution: {
        dryRun: true,
        launched: false,
        attached: false,
        unsafeSideEffects: false,
      },
      plannedSteps,
      audit: {
        governanceRequired: true,
        tapHandoffReady: true,
      },
      storage: storage.plan,
    },
    events: ["agentCore.basicTool.code.debugRun.planned", ...storage.events],
  };
}
