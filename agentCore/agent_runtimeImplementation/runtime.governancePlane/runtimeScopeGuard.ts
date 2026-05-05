/*
 * 文件定位：Agent 运行态实现层 / 运行治理面。
 * 核心目的：守住 runtime 作用域边界，防止应用、模块、工具、模型调用互相越界。
 * 能力要求1：需要确认某个动作是否只能看状态、能否改状态、能否触发工具或模型。
 * 能力要求2：这是避免 agentCore 被上层产品逻辑污染的重要门。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  RuntimeGovernanceBoundary,
  RuntimeGovernanceCaller,
  RuntimeGovernanceDecisionStatus,
  RuntimeGovernanceGate,
} from "./runtimeGovernancePlane.js";

export type RuntimeScopeOperation =
  | "read-state"
  | "mutate-state"
  | "invoke-tool"
  | "invoke-model"
  | "bridge-module"
  | "control-runtime";

export type RuntimeScopePermission =
  | "runtime.read"
  | "runtime.write"
  | "tool.invoke"
  | "model.invoke"
  | "module.bridge"
  | "runtime.control";

export type RuntimeScopeGuardErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_OPERATION"
  | "UNKNOWN_OPERATION"
  | "RUNTIME_NOT_READY"
  | "GOVERNANCE_REJECTED"
  | "OPERATION_NOT_ALLOWED"
  | "SCOPE_DENIED";

export type RuntimeScopeGuardRequest = {
  runtimeId?: string;
  caller?: RuntimeGovernanceCaller;
  operation?: RuntimeScopeOperation;
  action?: string;
  grantedScopes?: readonly string[];
  requestedScopes?: readonly string[];
  allowedOperations?: readonly RuntimeScopeOperation[];
  runtimeReady?: boolean;
  governance?: RuntimeGovernanceGate;
};

export type RuntimeScopeGuardDecision = {
  status: RuntimeGovernanceDecisionStatus;
  runtimeId: string;
  operation: RuntimeScopeOperation;
  action?: string;
  caller: RuntimeGovernanceCaller;
  requiredScopes: readonly RuntimeScopePermission[];
  requestedScopes: readonly string[];
  grantedScopes: readonly string[];
  missingScopes: readonly string[];
  canReadState: boolean;
  canMutateState: boolean;
  canInvokeTool: boolean;
  canInvokeModel: boolean;
  canBridgeModule: boolean;
  canControlRuntime: boolean;
  readonly: boolean;
  unsafeSideEffects: false;
};

export type RuntimeScopeGuardError = {
  code: RuntimeScopeGuardErrorCode;
  message: string;
  boundary: RuntimeGovernanceBoundary;
  publicSafe: true;
};

export type RuntimeScopeGuardResult =
  | {
      ok: true;
      decision: RuntimeScopeGuardDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeScopeGuardError;
      events: readonly string[];
    };

export const runtimeScopePermissionByOperation: Record<RuntimeScopeOperation, RuntimeScopePermission> = {
  "read-state": "runtime.read",
  "mutate-state": "runtime.write",
  "invoke-tool": "tool.invoke",
  "invoke-model": "model.invoke",
  "bridge-module": "module.bridge",
  "control-runtime": "runtime.control",
};

const knownRuntimeScopeOperations = new Set<RuntimeScopeOperation>([
  "read-state",
  "mutate-state",
  "invoke-tool",
  "invoke-model",
  "bridge-module",
  "control-runtime",
]);

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: RuntimeScopeGuardErrorCode,
  message: string,
  boundary: RuntimeGovernanceBoundary,
): RuntimeScopeGuardResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.governance.scopeGuard.rejected"],
  };
}

function normalizeCaller(caller: RuntimeGovernanceCaller): RuntimeGovernanceCaller {
  return {
    kind: caller.kind,
    id: caller.id.trim(),
    moduleId: caller.moduleId?.trim() || undefined,
    sessionId: caller.sessionId?.trim() || undefined,
  };
}

export function guardRuntimeScope(request?: RuntimeScopeGuardRequest): RuntimeScopeGuardResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime scope guard requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "runtime scope guard requires a caller with a stable id", "input");
  }

  if (request.operation === undefined) {
    return failure("MISSING_OPERATION", "runtime scope guard requires an operation", "input");
  }

  if (!knownRuntimeScopeOperations.has(request.operation)) {
    return failure("UNKNOWN_OPERATION", "runtime scope guard operation is not recognized", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime scope guard can only guard a ready runtime", "runtime-state");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime scope guard was rejected by governance",
      "governance",
    );
  }

  if (request.allowedOperations !== undefined && !request.allowedOperations.includes(request.operation)) {
    return failure(
      "OPERATION_NOT_ALLOWED",
      `operation ${request.operation} is outside the allowed runtime scope`,
      "scope",
    );
  }

  const requiredScope = runtimeScopePermissionByOperation[request.operation];
  const requestedScopes = cleanList([requiredScope, ...cleanList(request.requestedScopes)]);
  const grantedScopes = cleanList(request.grantedScopes);
  const missingScopes = requestedScopes.filter((scope) => !grantedScopes.includes(scope));

  if (missingScopes.length > 0) {
    return failure("SCOPE_DENIED", `runtime scope is missing permission: ${missingScopes.join(", ")}`, "scope");
  }

  return {
    ok: true,
    decision: {
      status: "allow",
      runtimeId: (request.runtimeId ?? "").trim(),
      operation: request.operation,
      action: request.action?.trim() || undefined,
      caller: normalizeCaller(request.caller),
      requiredScopes: [requiredScope],
      requestedScopes,
      grantedScopes,
      missingScopes,
      canReadState: request.operation === "read-state",
      canMutateState: request.operation === "mutate-state",
      canInvokeTool: request.operation === "invoke-tool",
      canInvokeModel: request.operation === "invoke-model",
      canBridgeModule: request.operation === "bridge-module",
      canControlRuntime: request.operation === "control-runtime",
      readonly: request.operation === "read-state",
      unsafeSideEffects: false,
    },
    events: ["runtime.governance.scopeGuard.allow"],
  };
}
