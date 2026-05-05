/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：在开发者通过公共 runtime API 调用 agentCore 前做契约门禁。
 * 能力要求1：需要检查参数形态、调用模式、能力范围和允许暴露的内部信息。
 * 能力要求2：它保证第三方开发者使用的是稳定 runtime 契约，而不是内部实现细节。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type DeveloperContractCallerKind = "application" | "official-module" | "runtime-surface";

export type DeveloperContractInvocationMode = "agent" | "tool" | "model" | "interface" | "stream" | "batch";

export type DeveloperContractExposure = "public" | "application" | "official-module";

export type DeveloperContractGateDecision = "allow" | "deny" | "approval-required" | "degrade";

export type DeveloperContractGateBoundary = "input" | "runtime-state" | "contract" | "governance" | "scope";

export type DeveloperContractGateErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_INVOCATION_MODE"
  | "MISSING_CAPABILITY_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "INVOCATION_MODE_DENIED"
  | "CAPABILITY_DENIED"
  | "EXPOSURE_DENIED";

export type DeveloperContractCaller = {
  kind: DeveloperContractCallerKind;
  id: string;
};

export type DeveloperContractGateCheck = {
  accepted: boolean;
  reason?: string;
};

export type DeveloperContractGateRequest = {
  runtimeId?: string;
  caller?: DeveloperContractCaller;
  invocationMode?: DeveloperContractInvocationMode;
  targetCapabilityId?: string;
  requestedExposure?: DeveloperContractExposure;
  allowedInvocationModes?: readonly DeveloperContractInvocationMode[];
  allowedCapabilityIds?: readonly string[];
  allowedExposures?: readonly DeveloperContractExposure[];
  runtimeReady?: boolean;
  contract?: DeveloperContractGateCheck;
  governance?: DeveloperContractGateCheck;
  approvalRequired?: boolean;
  approvalReason?: string;
  degradeToCapabilityId?: string;
  trace?: {
    correlationId?: string;
    sessionId?: string;
  };
};

export type DeveloperContractGateError = {
  code: DeveloperContractGateErrorCode;
  message: string;
  boundary: DeveloperContractGateBoundary;
  safeForDeveloper: true;
  internalDetailExposed: false;
};

export type DeveloperContractGateSnapshot = {
  runtimeId: string;
  caller: DeveloperContractCaller;
  invocationMode: DeveloperContractInvocationMode;
  capabilityId: string;
  requestedExposure: DeveloperContractExposure;
  decision: Exclude<DeveloperContractGateDecision, "deny">;
  degradedFromCapabilityId?: string;
  approvalReason?: string;
  visibleInternalDetails: false;
  dryRun: true;
  unsafeSideEffects: false;
  trace: {
    correlationId?: string;
    sessionId?: string;
  };
};

export type DeveloperContractGateResult =
  | {
      ok: true;
      decision: Exclude<DeveloperContractGateDecision, "deny">;
      gate: DeveloperContractGateSnapshot;
      events: readonly string[];
    }
  | {
      ok: false;
      decision: "deny";
      error: DeveloperContractGateError;
      events: readonly string[];
    };

const defaultExposures = ["public", "application", "official-module"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList<T extends string>(values: readonly T[] | undefined): readonly T[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean) as T[])];
}

function failure(
  code: DeveloperContractGateErrorCode,
  message: string,
  boundary: DeveloperContractGateBoundary,
): DeveloperContractGateResult {
  return {
    ok: false,
    decision: "deny",
    error: {
      code,
      message,
      boundary,
      safeForDeveloper: true,
      internalDetailExposed: false,
    },
    events: ["runtime.governance.developerContractGate.denied"],
  };
}

function createGateSnapshot(
  request: DeveloperContractGateRequest,
  runtimeId: string,
  caller: DeveloperContractCaller,
  invocationMode: DeveloperContractInvocationMode,
  requestedExposure: DeveloperContractExposure,
  decision: Exclude<DeveloperContractGateDecision, "deny">,
  capabilityId: string,
  degradedFromCapabilityId?: string,
): DeveloperContractGateSnapshot {
  return {
    runtimeId,
    caller: {
      kind: caller.kind,
      id: caller.id.trim(),
    },
    invocationMode,
    capabilityId,
    requestedExposure,
    decision,
    degradedFromCapabilityId,
    approvalReason: request.approvalReason?.trim() || undefined,
    visibleInternalDetails: false,
    dryRun: true,
    unsafeSideEffects: false,
    trace: {
      correlationId: request.trace?.correlationId?.trim() || undefined,
      sessionId: request.trace?.sessionId?.trim() || undefined,
    },
  };
}

export function evaluateDeveloperContractGate(
  request?: DeveloperContractGateRequest,
): DeveloperContractGateResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "developer contract gate requires a runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "developer contract gate requires a runtimeId", "input");
  }

  const caller = request.caller;
  if (caller === undefined || isBlank(caller.id)) {
    return failure("MISSING_CALLER", "developer contract gate requires an application or module caller", "input");
  }

  const invocationMode = request.invocationMode;
  if (invocationMode === undefined) {
    return failure("MISSING_INVOCATION_MODE", "developer contract gate requires an invocation mode", "input");
  }

  const targetCapabilityId = request.targetCapabilityId?.trim();
  if (!targetCapabilityId) {
    return failure("MISSING_CAPABILITY_ID", "developer contract gate requires a target capability", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "developer contract gate can only expose a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the developer call",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the developer call",
      "governance",
    );
  }

  const allowedInvocationModes = cleanList(request.allowedInvocationModes);
  if (allowedInvocationModes.length > 0 && !allowedInvocationModes.includes(invocationMode)) {
    return failure(
      "INVOCATION_MODE_DENIED",
      `invocation mode ${invocationMode} is outside the developer contract`,
      "scope",
    );
  }

  const requestedExposure = request.requestedExposure ?? "public";
  const allowedExposures = cleanList(request.allowedExposures ?? defaultExposures);
  if (!allowedExposures.includes(requestedExposure)) {
    return failure(
      "EXPOSURE_DENIED",
      `requested exposure ${requestedExposure} is outside the developer contract`,
      "scope",
    );
  }

  const allowedCapabilityIds = cleanList(request.allowedCapabilityIds);
  if (allowedCapabilityIds.length > 0 && !allowedCapabilityIds.includes(targetCapabilityId)) {
    const degradeToCapabilityId = request.degradeToCapabilityId?.trim();
    if (degradeToCapabilityId !== undefined && allowedCapabilityIds.includes(degradeToCapabilityId)) {
      return {
        ok: true,
        decision: "degrade",
        gate: createGateSnapshot(
          request,
          runtimeId,
          caller,
          invocationMode,
          requestedExposure,
          "degrade",
          degradeToCapabilityId,
          targetCapabilityId,
        ),
        events: ["runtime.governance.developerContractGate.degraded"],
      };
    }

    return failure(
      "CAPABILITY_DENIED",
      `capability ${targetCapabilityId} is outside the developer contract`,
      "scope",
    );
  }

  if (request.approvalRequired === true) {
    return {
      ok: true,
      decision: "approval-required",
      gate: createGateSnapshot(
        request,
        runtimeId,
        caller,
        invocationMode,
        requestedExposure,
        "approval-required",
        targetCapabilityId,
      ),
      events: ["runtime.governance.developerContractGate.approvalRequired"],
    };
  }

  return {
    ok: true,
    decision: "allow",
    gate: createGateSnapshot(request, runtimeId, caller, invocationMode, requestedExposure, "allow", targetCapabilityId),
    events: ["runtime.governance.developerContractGate.allowed"],
  };
}
