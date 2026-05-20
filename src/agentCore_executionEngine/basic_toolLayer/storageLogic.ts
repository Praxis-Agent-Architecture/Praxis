/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 storage Logic 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BaseToolStorageRecordInput,
  BaseToolStorageRecordKind,
  BaseToolStoredRecord,
} from "../../storagePool/baseToolStorage/baseToolStorageRecords.js";

export type {
  BaseToolStorageRecordInput,
  BaseToolStorageRecordKind,
  BaseToolStoredRecord,
} from "../../storagePool/baseToolStorage/baseToolStorageRecords.js";

export type BasicToolStorageOperation = "put" | "read" | "reuse" | "expire";

export type BasicToolStorageBoundary = "input" | "contract" | "scope" | "resource";

export type BaseToolStorageBoundary = "input" | "contract" | "governance" | "scope" | "storage";

export type BaseToolStorageGate = {
  accepted: boolean;
  reason?: string;
};

export type BasicToolStorageScope = {
  runtimeId?: string;
  sessionId?: string;
  tenantId?: string;
};

export type BasicToolStorageRecord = {
  key: string;
  material: unknown;
  scope: Required<Pick<BasicToolStorageScope, "runtimeId" | "sessionId">> & Pick<BasicToolStorageScope, "tenantId">;
  createdAtMs: number;
  expiresAtMs?: number;
  reusable: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type BasicToolStorageRequest = {
  operation?: BasicToolStorageOperation;
  scope?: BasicToolStorageScope;
  key?: string;
  material?: unknown;
  existingRecord?: BasicToolStorageRecord;
  nowMs?: number;
  ttlMs?: number;
  reusable?: boolean;
  dryRun?: boolean;
  allowCrossSessionReuse?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolStorageWriteRequest = {
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

export type BasicToolStorageErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_STORAGE_KEY"
  | "MISSING_MATERIAL"
  | "MATERIAL_NOT_FOUND"
  | "MATERIAL_EXPIRED"
  | "ISOLATION_VIOLATION"
  | "INVALID_TTL"
  | "REAL_STORAGE_MUTATION_BLOCKED";

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

export type BasicToolStorageError = {
  code: BasicToolStorageErrorCode;
  message: string;
  boundary: BasicToolStorageBoundary;
  publicSafe: true;
};

export type BaseToolStorageError = {
  code: BaseToolStorageErrorCode;
  message: string;
  boundary: BaseToolStorageBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BasicToolStoragePlan = {
  kind: "agentCore.basicTool.storagePlan";
  operation: BasicToolStorageOperation;
  key: string;
  scope: Required<Pick<BasicToolStorageScope, "runtimeId" | "sessionId">> & Pick<BasicToolStorageScope, "tenantId">;
  record?: BasicToolStorageRecord;
  existingRecord?: BasicToolStorageRecord;
  expired: boolean;
  reusable: boolean;
  wouldMutateStorage: boolean;
  dryRun: true;
  unsafeSideEffects: false;
  audit: {
    event: "agentCore.basicTool.storageLogic.planned";
    metadata: Readonly<Record<string, unknown>>;
  };
};

export type BaseToolStoragePlan = {
  kind: "agentCore.basicTool.storageLogic.writePlan";
  pool: "storagePool.baseToolStorage";
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  records: readonly BaseToolStoredRecord[];
  reuseIndex: Readonly<Record<string, readonly string[]>>;
  acceptedScopes: readonly string[];
  logic: {
    operation: "write-records";
    dryRun: true;
    wouldMutateStorage: true;
    persisted: false;
    isolation: "runtime-session";
  };
  audit: {
    event: "agentCore.basicTool.storageLogic.writePlanned";
    metadata: Readonly<Record<string, unknown>>;
  };
  unsafeSideEffects: false;
};

export type BasicToolStorageResult =
  | {
      ok: true;
      plan: BasicToolStoragePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BasicToolStorageError;
      events: readonly string[];
    };

export type BaseToolStorageWriteResult =
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

export const basicToolStorageLogicDescriptor = {
  capability: "manage-basic-tool-material-storage",
  layer: "agent_executionEngine.basic_toolLayer.storageLogic",
  defaultOperation: "put",
  defaultDryRun: true,
  unsafeSideEffects: false,
  storagePool: "storagePool.baseToolStorage",
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
  code: BasicToolStorageErrorCode,
  message: string,
  boundary: BasicToolStorageBoundary,
): BasicToolStorageResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.basicTool.storageLogic.rejected"],
  };
}

function writeFailure(
  code: BaseToolStorageErrorCode,
  message: string,
  boundary: BaseToolStorageBoundary,
): BaseToolStorageWriteResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.storageLogic.writeRejected"],
  };
}

function resolveWriteScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | BaseToolStorageWriteResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return writeFailure("SCOPE_DENIED", `base tool storage scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function validateWriteRecord(record: BaseToolStorageRecordInput, index: number): BaseToolStorageWriteResult | undefined {
  if (isBlank(record.id)) {
    return writeFailure("MISSING_RECORD_ID", `base tool storage record ${index} requires an id`, "input");
  }

  if (record.kind === undefined) {
    return writeFailure("MISSING_RECORD_KIND", `base tool storage record ${index} requires a kind`, "input");
  }

  if (isBlank(record.toolName)) {
    return writeFailure("MISSING_TOOL_NAME", `base tool storage record ${index} requires a toolName`, "input");
  }

  if (record.payload !== undefined && !isRecord(record.payload)) {
    return writeFailure("INVALID_RECORD_PAYLOAD", `base tool storage record ${index} payload must be a plain record`, "input");
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

function normalizeNow(value: number | undefined): number {
  return value ?? 0;
}

function normalizeTtl(value: number | undefined): number | BasicToolStorageResult | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    return failure("INVALID_TTL", "basic tool storage ttlMs must be a positive integer", "resource");
  }

  return value;
}

function isExpired(record: BasicToolStorageRecord | undefined, nowMs: number): boolean {
  return record?.expiresAtMs !== undefined && record.expiresAtMs <= nowMs;
}

function normalizeScope(
  scope: BasicToolStorageScope | undefined,
): BasicToolStoragePlan["scope"] | BasicToolStorageResult {
  const runtimeId = scope?.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "basic tool storage requires scope.runtimeId", "input");
  }

  const sessionId = scope?.sessionId?.trim();
  if (isBlank(sessionId)) {
    return failure("MISSING_SESSION_ID", "basic tool storage requires scope.sessionId", "input");
  }

  return {
    runtimeId: runtimeId ?? "",
    sessionId: sessionId ?? "",
    tenantId: scope?.tenantId?.trim() || undefined,
  };
}

function ensureIsolation(
  scope: BasicToolStoragePlan["scope"],
  record: BasicToolStorageRecord | undefined,
  allowCrossSessionReuse: boolean | undefined,
): BasicToolStorageResult | undefined {
  if (record === undefined) {
    return undefined;
  }

  if (record.scope.runtimeId !== scope.runtimeId) {
    return failure("ISOLATION_VIOLATION", "basic tool storage record belongs to a different runtime", "scope");
  }

  if (record.scope.tenantId !== scope.tenantId) {
    return failure("ISOLATION_VIOLATION", "basic tool storage record belongs to a different tenant", "scope");
  }

  if (record.scope.sessionId !== scope.sessionId && allowCrossSessionReuse !== true) {
    return failure("ISOLATION_VIOLATION", "basic tool storage record belongs to a different session", "scope");
  }

  return undefined;
}

export function planBasicToolStorageOperation(request: BasicToolStorageRequest = {}): BasicToolStorageResult {
  if (request.dryRun === false) {
    return failure(
      "REAL_STORAGE_MUTATION_BLOCKED",
      "first-round basic tool storage only returns a dry-run storage plan",
      "contract",
    );
  }

  const scope = normalizeScope(request.scope);
  if ("ok" in scope) {
    return scope;
  }

  const key = request.key?.trim();
  if (isBlank(key)) {
    return failure("MISSING_STORAGE_KEY", "basic tool storage requires a storage key", "input");
  }

  const ttlMs = normalizeTtl(request.ttlMs);
  if (typeof ttlMs !== "number" && ttlMs !== undefined) {
    return ttlMs;
  }

  const operation = request.operation ?? "put";
  const nowMs = normalizeNow(request.nowMs);
  const expired = isExpired(request.existingRecord, nowMs);
  const isolationError = ensureIsolation(scope, request.existingRecord, request.allowCrossSessionReuse);
  if (isolationError !== undefined) {
    return isolationError;
  }

  if (operation === "put" && request.material === undefined) {
    return failure("MISSING_MATERIAL", "basic tool storage put requires material", "input");
  }

  if ((operation === "read" || operation === "reuse" || operation === "expire") && request.existingRecord === undefined) {
    return failure("MATERIAL_NOT_FOUND", "basic tool storage operation requires an existing record", "input");
  }

  if ((operation === "read" || operation === "reuse") && expired) {
    return failure("MATERIAL_EXPIRED", "basic tool storage record has expired", "resource");
  }

  const record =
    operation === "put"
      ? {
          key: key ?? "",
          material: request.material,
          scope,
          createdAtMs: nowMs,
          expiresAtMs: ttlMs === undefined ? undefined : nowMs + ttlMs,
          reusable: request.reusable ?? false,
          metadata: request.metadata ?? {},
        }
      : undefined;

  return {
    ok: true,
    plan: {
      kind: "agentCore.basicTool.storagePlan",
      operation,
      key: key ?? "",
      scope,
      record,
      existingRecord: request.existingRecord,
      expired,
      reusable: operation === "put" ? (request.reusable ?? false) : (request.existingRecord?.reusable ?? false),
      wouldMutateStorage: operation === "put" || operation === "expire",
      dryRun: true,
      unsafeSideEffects: false,
      audit: {
        event: "agentCore.basicTool.storageLogic.planned",
        metadata: request.metadata ?? {},
      },
    },
    events: ["agentCore.basicTool.storageLogic.planned"],
  };
}

export function planBaseToolStorageWrite(request?: BaseToolStorageWriteRequest): BaseToolStorageWriteResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return writeFailure("MISSING_RUNTIME_ID", "base tool storage requires runtimeId", "input");
  }

  if (isBlank(request.sessionId)) {
    return writeFailure("MISSING_SESSION_ID", "base tool storage requires sessionId", "input");
  }

  if (request.dryRun === false) {
    return writeFailure(
      "REAL_STORAGE_NOT_ALLOWED",
      "base tool storage logic only returns a dry-run write plan until a storage executor is injected",
      "contract",
    );
  }

  if (request.contract?.accepted === false) {
    return writeFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "base tool storage write was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return writeFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "base tool storage write was rejected by runtime governance",
      "governance",
    );
  }

  if (request.records === undefined || request.records.length === 0) {
    return writeFailure("MISSING_RECORDS", "base tool storage requires at least one record", "input");
  }

  const acceptedScopes = resolveWriteScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sessionId = request.sessionId?.trim() ?? "";
  const invocationId = request.invocationId?.trim() || `${runtimeId}:${sessionId}:baseToolStorage`;
  const records: BaseToolStoredRecord[] = [];

  for (const [index, record] of request.records.entries()) {
    const invalid = validateWriteRecord(record, index);
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
      kind: "agentCore.basicTool.storageLogic.writePlan",
      pool: "storagePool.baseToolStorage",
      runtimeId,
      sessionId,
      invocationId,
      records,
      reuseIndex: buildReuseIndex(records),
      acceptedScopes,
      logic: {
        operation: "write-records",
        dryRun: true,
        wouldMutateStorage: true,
        persisted: false,
        isolation: "runtime-session",
      },
      audit: {
        event: "agentCore.basicTool.storageLogic.writePlanned",
        metadata: {},
      },
      unsafeSideEffects: false,
    },
    events: ["agentCore.basicTool.storageLogic.writePlanned"],
  };
}
