/*
 * 文件定位：Agent 运行态实现层。
 * 核心目的：承载 runtime Operation Bus 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：只服务 agentCore 内核，不写上层产品逻辑。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeOperationBusBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state" | "bus";

export type RuntimeOperationBusCallerKind =
  | "application"
  | "official-module"
  | "runtime-surface"
  | "inspection"
  | "debug";

export type RuntimeOperationBusDispatchMode = "dry-run";

export type RuntimeOperationBusGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeOperationBusCaller = {
  callerId?: string;
  kind?: RuntimeOperationBusCallerKind;
};

export type RuntimeOperationBusOperation = {
  operationId?: string;
  kind?: string;
  targetSurface?: string;
  caller?: RuntimeOperationBusCaller;
  payload?: Record<string, unknown>;
  trace?: {
    correlationId?: string;
    causationId?: string;
  };
};

export type RuntimeOperationBusRequest = {
  runtimeId?: string;
  runtimeReady?: boolean;
  operation?: RuntimeOperationBusOperation;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  mountedSurfaces?: readonly string[];
  contract?: RuntimeOperationBusGate;
  governance?: RuntimeOperationBusGate;
  dryRun?: boolean;
};

export type RuntimeOperationBusErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_OPERATION"
  | "MISSING_OPERATION_KIND"
  | "MISSING_TARGET_SURFACE"
  | "MISSING_CALLER"
  | "INVALID_PAYLOAD"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "TARGET_SURFACE_NOT_MOUNTED"
  | "REAL_DISPATCH_NOT_ALLOWED";

export type RuntimeOperationBusError = {
  code: RuntimeOperationBusErrorCode;
  message: string;
  boundary: RuntimeOperationBusBoundary;
  safeForRuntimeInspection: true;
  internalDetailExposed: false;
};

export type RuntimeOperationBusEnvelope = {
  runtimeId: string;
  busSurface: "runtime.operationBus";
  operationId: string;
  operationKind: string;
  caller: {
    callerId: string;
    kind: RuntimeOperationBusCallerKind;
  };
  targetSurface: string;
  payload: Readonly<Record<string, unknown>>;
  acceptedScopes: readonly string[];
  trace: {
    correlationId?: string;
    causationId?: string;
  };
  dispatchMode: RuntimeOperationBusDispatchMode;
  status: "accepted-for-audit";
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  unsafeSideEffects: false;
};

export type RuntimeOperationBusResult =
  | {
      ok: true;
      envelope: RuntimeOperationBusEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeOperationBusError;
      events: readonly string[];
    };

export const runtimeOperationBusDescriptor = {
  surface: "runtime.operationBus",
  capability: "runtimeOperationBus",
  purpose:
    "accept runtime operations from applications and official modules through contract and governance checks before real dispatch exists",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeOperationBusErrorCode,
  message: string,
  boundary: RuntimeOperationBusBoundary,
): RuntimeOperationBusResult {
  return {
    ok: false,
    error: {
      code,
      message,
      boundary,
      safeForRuntimeInspection: true,
      internalDetailExposed: false,
    },
    events: ["runtime.operationBus.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | RuntimeOperationBusResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  if (allowed.length === 0) {
    return requested;
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `runtime operation scope ${denied[0]} is outside governance`, "scope");
  }

  return requested;
}

function normalizeCaller(caller: RuntimeOperationBusCaller | undefined): RuntimeOperationBusEnvelope["caller"] | undefined {
  if (caller === undefined || isBlank(caller.callerId) || caller.kind === undefined) {
    return undefined;
  }

  return {
    callerId: (caller.callerId ?? "").trim(),
    kind: caller.kind,
  };
}

export function submitRuntimeOperation(request?: RuntimeOperationBusRequest): RuntimeOperationBusResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime operation bus requires runtimeId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime operation bus can only accept operations for a ready runtime", "runtime-state");
  }

  if (request.dryRun === false) {
    return failure(
      "REAL_DISPATCH_NOT_ALLOWED",
      "runtime operation bus only supports dry-run audit envelopes in the first implementation",
      "governance",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime operation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime operation was rejected by runtime governance",
      "governance",
    );
  }

  if (request.operation === undefined) {
    return failure("MISSING_OPERATION", "runtime operation bus requires an operation envelope", "input");
  }

  const operationKind = request.operation.kind?.trim();
  if (!operationKind) {
    return failure("MISSING_OPERATION_KIND", "runtime operation bus requires operation.kind", "input");
  }

  const targetSurface = request.operation.targetSurface?.trim();
  if (!targetSurface) {
    return failure("MISSING_TARGET_SURFACE", "runtime operation bus requires operation.targetSurface", "input");
  }

  const caller = normalizeCaller(request.operation.caller);
  if (caller === undefined) {
    return failure("MISSING_CALLER", "runtime operation bus requires callerId and caller kind", "input");
  }

  if (request.operation.payload !== undefined && !isRecord(request.operation.payload)) {
    return failure("INVALID_PAYLOAD", "runtime operation payload must be a plain record", "input");
  }

  const mountedSurfaces = cleanList(request.mountedSurfaces);
  if (mountedSurfaces.length > 0 && !mountedSurfaces.includes(targetSurface)) {
    return failure(
      "TARGET_SURFACE_NOT_MOUNTED",
      `runtime operation target surface ${targetSurface} is not mounted`,
      "bus",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const operationId =
    request.operation.operationId?.trim() || `${runtimeId}:${caller.kind}:${targetSurface}:${operationKind}`;

  return {
    ok: true,
    envelope: {
      runtimeId,
      busSurface: "runtime.operationBus",
      operationId,
      operationKind,
      caller,
      targetSurface,
      payload: request.operation.payload ?? {},
      acceptedScopes,
      trace: {
        correlationId: request.operation.trace?.correlationId?.trim() || undefined,
        causationId: request.operation.trace?.causationId?.trim() || undefined,
      },
      dispatchMode: "dry-run",
      status: "accepted-for-audit",
      contractSurface: "runtime.contractSurface",
      governanceRequired: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.operationBus.accepted"],
  };
}
