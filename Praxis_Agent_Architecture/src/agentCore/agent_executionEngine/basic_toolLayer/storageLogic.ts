/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 storage Logic 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type BasicToolStorageOperation = "put" | "read" | "reuse" | "expire";

export type BasicToolStorageBoundary = "input" | "contract" | "scope" | "resource";

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

export type BasicToolStorageError = {
  code: BasicToolStorageErrorCode;
  message: string;
  boundary: BasicToolStorageBoundary;
  publicSafe: true;
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

export const basicToolStorageLogicDescriptor = {
  capability: "manage-basic-tool-material-storage",
  layer: "agent_executionEngine.basic_toolLayer.storageLogic",
  defaultOperation: "put",
  defaultDryRun: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
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
