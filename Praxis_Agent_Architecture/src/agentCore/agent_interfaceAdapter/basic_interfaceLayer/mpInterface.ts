/*
 * 文件定位：Agent 接口适配层 / 内置接口层。
 * 核心目的：承载 mp Interface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
 * 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type MpInterfaceBoundary = "input" | "contract" | "governance" | "scope" | "runtime-state";

export type MpInterfaceGate = {
  accepted: boolean;
  reason?: string;
};

export type MpInterfaceCapabilityDeclaration = {
  capabilityId?: string;
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  rules?: readonly string[];
};

export type MpInterfaceRequest = {
  runtimeId?: string;
  interfaceId?: string;
  moduleId?: string;
  capabilities?: readonly MpInterfaceCapabilityDeclaration[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: MpInterfaceGate;
  governance?: MpInterfaceGate;
};

export type MpInterfaceErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_MODULE_ID"
  | "MISSING_CAPABILITY"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type MpInterfaceError = {
  code: MpInterfaceErrorCode;
  message: string;
  boundary: MpInterfaceBoundary;
  safeForRuntimeInspection: true;
};

export type MpInterfaceCapability = {
  capabilityId: string;
  inputBoundary: readonly string[];
  outputBoundary: readonly string[];
  rules: readonly string[];
};

export type MpInterfaceContract = {
  module: "mp";
  runtimeId: string;
  interfaceId: string;
  moduleId: string;
  route: "runtime.interfaceAdapter";
  capabilities: readonly MpInterfaceCapability[];
  acceptedScopes: readonly string[];
  contractSurface: "runtime.contractSurface";
  governanceRequired: true;
  dispatch: "dry-run";
  unsafeSideEffects: false;
  internalStrategyIncluded: false;
};

export type MpInterfaceResult =
  | {
      ok: true;
      contract: MpInterfaceContract;
      events: readonly string[];
    }
  | {
      ok: false;
      error: MpInterfaceError;
      events: readonly string[];
    };

export const mpInterfaceDescriptor = {
  module: "mp",
  route: "runtime.interfaceAdapter",
  purpose: "define the MP official-module interface boundary without implementing MP strategy",
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(code: MpInterfaceErrorCode, message: string, boundary: MpInterfaceBoundary): MpInterfaceResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["interface.mp.boundary.rejected"],
  };
}

function normalizeCapabilities(
  capabilities: readonly MpInterfaceCapabilityDeclaration[] | undefined,
): MpInterfaceCapability[] | MpInterfaceResult {
  const normalized: MpInterfaceCapability[] = [];

  for (const capability of capabilities ?? []) {
    const capabilityId = capability.capabilityId?.trim();
    if (!capabilityId) {
      return failure("MISSING_CAPABILITY", "MP interface capabilities require capabilityId", "input");
    }

    normalized.push({
      capabilityId,
      inputBoundary: cleanList(capability.inputBoundary),
      outputBoundary: cleanList(capability.outputBoundary),
      rules: cleanList(capability.rules),
    });
  }

  if (normalized.length === 0) {
    return failure("MISSING_CAPABILITY", "MP interface boundary requires at least one capability", "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | MpInterfaceResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `MP interface scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function defineMpInterfaceBoundary(request?: MpInterfaceRequest): MpInterfaceResult {
  if (request === undefined) {
    return failure("MISSING_RUNTIME_ID", "MP interface boundary requires runtimeId", "input");
  }

  const runtimeId = request.runtimeId?.trim();
  const interfaceId = request.interfaceId?.trim();
  const moduleId = request.moduleId?.trim();

  if (!runtimeId) {
    return failure("MISSING_RUNTIME_ID", "MP interface boundary requires runtimeId", "input");
  }

  if (!interfaceId) {
    return failure("MISSING_INTERFACE_ID", "MP interface boundary requires interfaceId", "input");
  }

  if (!moduleId) {
    return failure("MISSING_MODULE_ID", "MP interface boundary requires moduleId", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "MP interface boundary can only attach to a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "MP interface boundary was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "MP interface boundary was rejected by runtime governance",
      "governance",
    );
  }

  const capabilities = normalizeCapabilities(request.capabilities);
  if ("ok" in capabilities) {
    return capabilities;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  return {
    ok: true,
    contract: {
      module: "mp",
      runtimeId,
      interfaceId,
      moduleId,
      route: "runtime.interfaceAdapter",
      capabilities,
      acceptedScopes,
      contractSurface: "runtime.contractSurface",
      governanceRequired: true,
      dispatch: "dry-run",
      unsafeSideEffects: false,
      internalStrategyIncluded: false,
    },
    events: ["interface.mp.boundary.defined"],
  };
}
