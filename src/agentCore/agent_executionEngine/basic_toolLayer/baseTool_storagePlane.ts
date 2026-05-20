/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层。
 * 核心目的：承载 base Tool storage Plane 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { BaseToolStoragePlan } from "./storageLogic.js";

export type BaseToolStoragePlaneBoundary = "input" | "contract" | "governance" | "scope" | "presentation";

export type BaseToolStoragePlaneVisibility = "summary" | "records" | "reuse-index";

export type BaseToolStoragePlaneGate = {
  accepted: boolean;
  reason?: string;
};

export type BaseToolStoragePlaneRequest = {
  runtimeId?: string;
  sessionId?: string;
  storagePlan?: BaseToolStoragePlan;
  visibility?: BaseToolStoragePlaneVisibility;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: BaseToolStoragePlaneGate;
  governance?: BaseToolStoragePlaneGate;
  auditMetadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolStoragePlaneErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_STORAGE_PLAN"
  | "STORAGE_PLAN_SCOPE_MISMATCH"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type BaseToolStoragePlaneError = {
  code: BaseToolStoragePlaneErrorCode;
  message: string;
  boundary: BaseToolStoragePlaneBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type BaseToolStoragePlaneRecordView = {
  id: string;
  kind: string;
  toolName: string;
  invocationId: string;
  reuseKey?: string;
  tags: readonly string[];
  payloadExposed: false;
};

export type BaseToolStoragePlaneView = {
  plane: "baseTool_storagePlane";
  sourcePlanKind: BaseToolStoragePlan["kind"];
  storagePool: BaseToolStoragePlan["pool"];
  runtimeId: string;
  sessionId: string;
  invocationId: string;
  visibility: BaseToolStoragePlaneVisibility;
  recordCount: number;
  recordKinds: Readonly<Record<string, number>>;
  toolNames: readonly string[];
  reuseKeys: readonly string[];
  records: readonly BaseToolStoragePlaneRecordView[];
  acceptedScopes: readonly string[];
  audit: {
    event: "agentCore.basicTool.storagePlane.exposed";
    governanceRequired: true;
    storageLogicOwnsWriteRules: true;
    planeOwnsPresentation: true;
    metadata: Readonly<Record<string, unknown>>;
  };
  unsafeSideEffects: false;
};

export type BaseToolStoragePlaneResult =
  | {
      ok: true;
      view: BaseToolStoragePlaneView;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BaseToolStoragePlaneError;
      events: readonly string[];
    };

export const baseToolStoragePlaneDescriptor = {
  plane: "baseTool_storagePlane",
  purpose: "govern, expose, and present base tool storage plans produced by storageLogic",
  storagePool: "storagePool.baseToolStorage",
  ownsStorageWriteRules: false,
  ownsGovernanceExposure: true,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: BaseToolStoragePlaneErrorCode,
  message: string,
  boundary: BaseToolStoragePlaneBoundary,
): BaseToolStoragePlaneResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["agentCore.basicTool.storagePlane.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): string[] | BaseToolStoragePlaneResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `base tool storage plane scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function countRecordKinds(plan: BaseToolStoragePlan): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of plan.records) {
    counts[record.kind] = (counts[record.kind] ?? 0) + 1;
  }

  return counts;
}

function exposeRecords(
  plan: BaseToolStoragePlan,
  visibility: BaseToolStoragePlaneVisibility,
): readonly BaseToolStoragePlaneRecordView[] {
  if (visibility === "summary") {
    return [];
  }

  return plan.records.map((record) => ({
    id: record.id,
    kind: record.kind,
    toolName: record.toolName,
    invocationId: record.invocationId,
    reuseKey: visibility === "reuse-index" ? record.reuseKey : undefined,
    tags: record.tags,
    payloadExposed: false,
  }));
}

export function exposeBaseToolStoragePlane(
  request: BaseToolStoragePlaneRequest = {},
): BaseToolStoragePlaneResult {
  const runtimeId = request.runtimeId?.trim();
  if (isBlank(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "base tool storage plane requires runtimeId", "input");
  }

  const sessionId = request.sessionId?.trim();
  if (isBlank(sessionId)) {
    return failure("MISSING_SESSION_ID", "base tool storage plane requires sessionId", "input");
  }

  if (request.storagePlan === undefined) {
    return failure("MISSING_STORAGE_PLAN", "base tool storage plane requires a storageLogic plan", "input");
  }

  if (request.storagePlan.runtimeId !== runtimeId || request.storagePlan.sessionId !== sessionId) {
    return failure(
      "STORAGE_PLAN_SCOPE_MISMATCH",
      "base tool storage plane can only expose a plan from the same runtime and session",
      "scope",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "base tool storage plane was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "base tool storage plane was rejected by runtime governance",
      "governance",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if (!Array.isArray(acceptedScopes)) {
    return acceptedScopes;
  }

  const visibility = request.visibility ?? "summary";
  const storagePlan = request.storagePlan;

  return {
    ok: true,
    view: {
      plane: "baseTool_storagePlane",
      sourcePlanKind: storagePlan.kind,
      storagePool: storagePlan.pool,
      runtimeId: runtimeId ?? "",
      sessionId: sessionId ?? "",
      invocationId: storagePlan.invocationId,
      visibility,
      recordCount: storagePlan.records.length,
      recordKinds: countRecordKinds(storagePlan),
      toolNames: cleanList(storagePlan.records.map((record) => record.toolName)),
      reuseKeys: Object.keys(storagePlan.reuseIndex).sort(),
      records: exposeRecords(storagePlan, visibility),
      acceptedScopes,
      audit: {
        event: "agentCore.basicTool.storagePlane.exposed",
        governanceRequired: true,
        storageLogicOwnsWriteRules: true,
        planeOwnsPresentation: true,
        metadata: request.auditMetadata ?? {},
      },
      unsafeSideEffects: false,
    },
    events: ["agentCore.basicTool.storagePlane.exposed"],
  };
}
