/*
 * 文件定位：Agent 接口适配层 / 自定义接口层。
 * 核心目的：承载 custom Interface Reuser 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
 * 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  hasCustomInterfaceScopeAccess,
  type CustomInterfaceDefinition,
  type CustomInterfaceError,
  type CustomInterfaceGate,
} from "./customInterfaceDefiner.js";

export type CustomInterfaceReuseErrorCode =
  | CustomInterfaceError["code"]
  | "INTERFACE_NOT_AVAILABLE"
  | "OPERATION_NOT_AVAILABLE";

export type CustomInterfaceReuseError = Omit<CustomInterfaceError, "code"> & {
  code: CustomInterfaceReuseErrorCode;
};

export type CustomInterfaceReuseRequest = {
  interfaceId?: string;
  operation?: string;
  availableInterfaces?: readonly CustomInterfaceDefinition[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: CustomInterfaceGate;
  governance?: CustomInterfaceGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomInterfaceReusePlan = {
  interfaceId: string;
  operation?: string;
  entrypoint: string;
  capabilityNames: readonly string[];
  dispatch: "dry-run";
  runtimeGoverned: true;
  touchesInterfaceImplementation: false;
  metadata: Readonly<Record<string, unknown>>;
};

export type CustomInterfaceReuseResult =
  | {
      ok: true;
      plan: CustomInterfaceReusePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceReuseError;
      events: readonly string[];
    };

function reuseFailure(
  code: CustomInterfaceReuseErrorCode,
  message: string,
  boundary: CustomInterfaceReuseError["boundary"],
): CustomInterfaceReuseResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["custom.interface.reuse.rejected"],
  };
}

export function planCustomInterfaceReuse(request: CustomInterfaceReuseRequest = {}): CustomInterfaceReuseResult {
  const interfaceId = request.interfaceId?.trim();
  if (interfaceId === undefined || interfaceId.length === 0) {
    return reuseFailure("MISSING_INTERFACE_ID", "custom interface reuse requires an interfaceId", "input");
  }

  if (request.contract?.accepted === false) {
    return reuseFailure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? `contract rejected custom interface reuse ${interfaceId}`,
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return reuseFailure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? `governance rejected custom interface reuse ${interfaceId}`,
      "governance",
    );
  }

  if (!hasCustomInterfaceScopeAccess(request.requestedScopes, request.allowedScopes)) {
    return reuseFailure("SCOPE_DENIED", `scope denied for custom interface reuse ${interfaceId}`, "scope");
  }

  const definition = request.availableInterfaces?.find((candidate) => candidate.interfaceId === interfaceId);
  if (definition === undefined) {
    return reuseFailure("INTERFACE_NOT_AVAILABLE", `custom interface ${interfaceId} is not available for reuse`, "input");
  }

  const operation = request.operation?.trim() || undefined;
  const supportedOperations = new Set(definition.capabilities.flatMap((capability) => capability.operations));
  if (operation !== undefined && supportedOperations.size > 0 && !supportedOperations.has(operation)) {
    return reuseFailure(
      "OPERATION_NOT_AVAILABLE",
      `custom interface ${interfaceId} does not expose operation ${operation}`,
      "contract",
    );
  }

  return {
    ok: true,
    plan: {
      interfaceId,
      operation,
      entrypoint: definition.entrypoint,
      capabilityNames: definition.capabilities.map((capability) => capability.name),
      dispatch: "dry-run",
      runtimeGoverned: true,
      touchesInterfaceImplementation: false,
      metadata: request.metadata ?? {},
    },
    events: ["custom.interface.reuse.planned"],
  };
}
