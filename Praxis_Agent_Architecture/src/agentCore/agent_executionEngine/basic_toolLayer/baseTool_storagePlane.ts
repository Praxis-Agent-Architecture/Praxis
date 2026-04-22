/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 base Tool storage Plane 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type BaseToolStorageBoundary = "input" | "contract" | "governance" | "scope" | "storage";

export type BaseToolStorageRecordKind = "runtime-material" | "result-state" | "audit-trace" | "reuse-index";

export type BaseToolStorageGate = {
  accepted: boolean;
  reason?: string;
};

export type BaseToolStorageRecordInput = {
  id?: string;
  kind?: BaseToolStorageRecordKind;
  toolName?: string;
  invocationId?: string;
  payload?: Record<string, unknown>;
  reuseKey?: string;
  tags?: readonly string[];
};

export type BaseToolStorageRequest = {
  runtimeId?: string;
  sessionId?: string;
  invocationId?: string;
  records?: readonly BaseToolStorageRecordInput[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  dryRun?: boolean;
  contract?: BaseToolStorageGate;
  governance?: BaseToolStorageGate;
};

export type BaseToolStorageErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_RECORDS"
  | "MISSING_RECORD_ID"
  | "MISSING_RECORD_KIND"
  | "MISSING_TOOL_NAME"
  | "INVALID_RECORD_PAYLOAD"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "REAL_STORAGE_NOT_ALLOWED";

export type BaseToolStorageError = {
  code: BaseToolStorageErrorCode;
  message: string;
  boundary: BaseToolStorageBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BaseToolStoredRecord = {
  id: string;
  kind: BaseToolStorageRecordKind;
  toolName: string;
  invocationId: string;
  payload: Readonly<Record<string, unknown>>;
  reuseKey?: string;
  tags: readonly string[];
};

export type BaseToolStoragePlan = {
  plane: "baseTool_storagePlane";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  records: readonly BaseToolStoredRecord[];
  reuseIndex: Readonly<Record<string, readonly string[]>>;
  acceptedScopes: readonly string[];
  audit: {
    dryRun: true;
    persisted: false;
    governanceRequired: true;
    contractSurface: "runtime.contractSurface";
    storagePurpose: "tool-material-result-audit-reuse";
  };
  unsafeSideEffects: false;
};

export type BaseToolStorageResult =
  | {
      ok: true;
      plan: BaseToolStoragePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BaseToolStorageError;
      events: readonly string[];
    };

export const baseToolStoragePlaneDescriptor = {
  plane: "baseTool_storagePlane",
  purpose: "plan storage for base tool materials, result state, audit traces, and reuse indexes",
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

function failure(
  code: BaseToolStorageErrorCode,
  message: string,
  boundary: BaseToolStorageBoundary,
): BaseToolStorageResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.storage.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | BaseToolStorageResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `base tool storage scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function validateRecord(record: BaseToolStorageRecordInput, index: number): BaseToolStorageResult | undefined {
  if (isBlank(record.id)) {
    return failure("MISSING_RECORD_ID", `base tool storage record ${index} requires an id`, "input");
  }

  if (record.kind === undefined) {
    return failure("MISSING_RECORD_KIND", `base tool storage record ${index} requires a kind`, "input");
  }

  if (isBlank(record.toolName)) {
    return failure("MISSING_TOOL_NAME", `base tool storage record ${index} requires a toolName`, "input");
  }

  if (record.payload !== undefined && !isRecord(record.payload)) {
    return failure("INVALID_RECORD_PAYLOAD", `base tool storage record ${index} payload must be a plain record`, "input");
  }

  return undefined;
}

function buildReuseIndex(records: readonly BaseToolStoredRecord[]): Record<string, readonly string[]> {
  const index = new Map<string, string[]>();

  for (const record of records) {
    if (record.reuseKey === undefined) {
      continue;
    }

    const current = index.get(record.reuseKey) ?? [];
    current.push(record.id);
    index.set(record.reuseKey, current);
  }

  return Object.fromEntries(index);
}

export function planBaseToolStorageWrite(request?: BaseToolStorageRequest): BaseToolStorageResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "base tool storage requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "base tool storage requires sessionId", "input");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_STORAGE_NOT_ALLOWED",
      "first-round base tool storage only returns a dry-run storage plan",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "base tool storage was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "base tool storage was rejected by runtime governance",
      "governance",
    );
  }

  if (request.records === undefined || request.records.length === 0) {
    return failure("MISSING_RECORDS", "base tool storage requires at least one record", "input");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() || `${runtimeId}:${sessionId}:baseToolStorage`;
  const records: BaseToolStoredRecord[] = [];

  for (const [index, record] of request.records.entries()) {
    const invalid = validateRecord(record, index);
    if (invalid !== undefined) {
      return invalid;
    }

    records.push({
      id: record.id?.trim() ?? "",
      kind: record.kind ?? "runtime-material",
      toolName: record.toolName?.trim() ?? "",
      invocationId: record.invocationId?.trim() || invocationId,
      payload: record.payload ?? {},
      reuseKey: record.reuseKey?.trim() || undefined,
      tags: cleanList(record.tags),
    });
  }

  return {
    ok: true,
    plan: {
      plane: "baseTool_storagePlane",
      runtimeId,
      sessionId,
      invocationId,
      records,
      reuseIndex: buildReuseIndex(records),
      acceptedScopes,
      audit: {
        dryRun: true,
        persisted: false,
        governanceRequired: true,
        contractSurface: "runtime.contractSurface",
        storagePurpose: "tool-material-result-audit-reuse",
      },
      unsafeSideEffects: false,
    },
    events: ["agentCore.basicTool.storage.planned"],
  };
}
