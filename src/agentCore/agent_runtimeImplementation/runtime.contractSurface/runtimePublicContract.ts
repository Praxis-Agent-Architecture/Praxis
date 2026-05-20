/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Public Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeContractBoundary = "input" | "contract" | "governance" | "runtime-state";

export type RuntimeContractGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeContractCallerKind = "application" | "official-module" | "runtime-surface";

export type RuntimeContractCaller = {
  kind: RuntimeContractCallerKind;
  id: string;
};

export type RuntimePublicContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimePublicContractError = {
  code: RuntimePublicContractErrorCode;
  message: string;
  boundary: RuntimeContractBoundary;
  publicSafe: true;
};

export type RuntimePublicContractRequest = {
  runtimeId?: string;
  caller?: RuntimeContractCaller;
  runtimeReady?: boolean;
  requestedSurfaces?: readonly string[];
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimePublicContractSnapshot = {
  runtimeId: string;
  caller: RuntimeContractCaller;
  exposure: "public";
  allowedSurfaces: readonly string[];
  readonly: true;
  unsafeSideEffects: false;
};

export type RuntimePublicContractResult =
  | {
      ok: true;
      contract: RuntimePublicContractSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimePublicContractError;
      events: readonly string[];
    };

const defaultPublicSurfaces = [
  "runtime.applicationSurface",
  "runtime.officialModuleSurface",
  "runtime.invocationMethod",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimePublicContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimePublicContractResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.publicContract.rejected"],
  };
}

export function defineRuntimePublicContract(
  request?: RuntimePublicContractRequest,
): RuntimePublicContractResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime public contract requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "runtime public contract requires an application or module caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "public contract can only expose a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime public contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime public contract was rejected by governance",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const requestedSurfaces = cleanList(request.requestedSurfaces);

  return {
    ok: true,
    contract: {
      runtimeId,
      caller: {
        kind: request.caller.kind,
        id: request.caller.id.trim(),
      },
      exposure: "public",
      allowedSurfaces: requestedSurfaces.length > 0 ? requestedSurfaces : defaultPublicSurfaces,
      readonly: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.publicContract.accepted"],
  };
}
