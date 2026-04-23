/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / 代码调试工具。
 * 核心目的：提供 代码基础工具 / 代码调试工具 中的“收集调试日志”基础能力原语。
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

export type CodeDebugCollectLogsBoundary = "input" | "contract" | "governance" | "scope" | "storage";

export type CodeDebugLogSourceKind = "debug-console" | "process" | "test-run" | "file";

export type CodeDebugLogSourceInput = {
  kind?: CodeDebugLogSourceKind;
  id?: string;
  path?: string;
  label?: string;
};

export type CodeDebugLogRedaction = {
  secrets?: boolean;
  absolutePaths?: boolean;
};

export type CodeDebugCollectLogsRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  sources?: readonly CodeDebugLogSourceInput[];
  maxEntries?: number;
  since?: string;
  redaction?: CodeDebugLogRedaction;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: BaseToolStorageGate;
  governance?: BaseToolStorageGate;
};

export type CodeDebugCollectLogsErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_LOG_SOURCES"
  | "MISSING_SOURCE_KIND"
  | "MISSING_SOURCE_IDENTIFIER"
  | "INVALID_LOG_LIMIT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_LOG_COLLECTION_NOT_ALLOWED"
  | "STORAGE_PLAN_REJECTED";

export type CodeDebugCollectLogsError = {
  code: CodeDebugCollectLogsErrorCode;
  message: string;
  boundary: CodeDebugCollectLogsBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type CodeDebugLogSource = {
  kind: CodeDebugLogSourceKind;
  id: string;
  path?: string;
  label?: string;
};

export type CodeDebugCollectLogsPlan = {
  toolName: "code.debugCollectLogs";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  sources: readonly CodeDebugLogSource[];
  maxEntries: number;
  since?: string;
  redaction: Required<CodeDebugLogRedaction>;
  permissions: readonly ["debug:read", "logs:read"];
  execution: {
    dryRun: true;
    collected: false;
    unsafeSideEffects: false;
  };
  audit: {
    governanceRequired: true;
    tapHandoffReady: true;
  };
  storage: BaseToolStoragePlan;
};

export type CodeDebugCollectLogsResult =
  | {
      ok: true;
      plan: CodeDebugCollectLogsPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CodeDebugCollectLogsError;
      events: readonly string[];
    };

export const codeDebugCollectLogsDescriptor = {
  toolName: "code.debugCollectLogs",
  toolFamily: "codeBase.debugCode",
  purpose: "collect debug logs through a dry-run, governable tool envelope",
  dryRunOnly: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CodeDebugCollectLogsErrorCode,
  message: string,
  boundary: CodeDebugCollectLogsBoundary,
): CodeDebugCollectLogsResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.code.debugCollectLogs.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | CodeDebugCollectLogsResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `debug log scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function normalizeSource(source: CodeDebugLogSourceInput, index: number): CodeDebugLogSource | CodeDebugCollectLogsResult {
  if (source.kind === undefined) {
    return failure("MISSING_SOURCE_KIND", `code.debugCollectLogs source ${index} requires a kind`, "input");
  }

  const id = source.id?.trim() || source.path?.trim();
  if (id === undefined || id.length === 0) {
    return failure(
      "MISSING_SOURCE_IDENTIFIER",
      `code.debugCollectLogs source ${index} requires an id or path`,
      "input",
    );
  }

  return {
    kind: source.kind,
    id,
    path: source.path?.trim() || undefined,
    label: source.label?.trim() || undefined,
  };
}

function normalizeRedaction(redaction: CodeDebugLogRedaction | undefined): Required<CodeDebugLogRedaction> {
  return {
    secrets: redaction?.secrets ?? true,
    absolutePaths: redaction?.absolutePaths ?? true,
  };
}

export function planCodeDebugCollectLogs(
  request?: CodeDebugCollectLogsRequest,
): CodeDebugCollectLogsResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "code.debugCollectLogs requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "code.debugCollectLogs requires sessionId", "input");
  }

  if (request.sources === undefined || request.sources.length === 0) {
    return failure("MISSING_LOG_SOURCES", "code.debugCollectLogs requires at least one log source", "input");
  }

  if (request.maxEntries !== undefined && (!Number.isInteger(request.maxEntries) || request.maxEntries < 1)) {
    return failure("INVALID_LOG_LIMIT", "code.debugCollectLogs maxEntries must be a positive integer", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_LOG_COLLECTION_NOT_ALLOWED",
      "first-round code.debugCollectLogs only plans a dry-run log collection envelope",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "code.debugCollectLogs was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "code.debugCollectLogs was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const sources: CodeDebugLogSource[] = [];
  for (const [index, source] of request.sources.entries()) {
    const normalized = normalizeSource(source, index);
    if (!("kind" in normalized)) {
      return normalized;
    }
    sources.push(normalized);
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() || `${runtimeId}:${sessionId}:code.debugCollectLogs`;
  const maxEntries = request.maxEntries ?? 200;
  const redaction = normalizeRedaction(request.redaction);

  const storage = planBaseToolStorageWrite({
    runtimeId,
    sessionId,
    invocationId,
    records: [
      {
        id: `${invocationId}:log-plan`,
        kind: "audit-trace",
        toolName: "code.debugCollectLogs",
        invocationId,
        reuseKey: `debug-logs:${sources.map((source) => source.id).join("|")}`,
        tags: ["code", "debug", "collect-logs"],
        payload: {
          sources,
          maxEntries,
          since: request.since,
          redaction,
          acceptedScopes,
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
      toolName: "code.debugCollectLogs",
      runtimeId,
      sessionId,
      invocationId,
      sources,
      maxEntries,
      since: request.since?.trim() || undefined,
      redaction,
      permissions: ["debug:read", "logs:read"],
      execution: {
        dryRun: true,
        collected: false,
        unsafeSideEffects: false,
      },
      audit: {
        governanceRequired: true,
        tapHandoffReady: true,
      },
      storage: storage.plan,
    },
    events: ["agentCore.basicTool.code.debugCollectLogs.planned", ...storage.events],
  };
}
