/*
 * 文件定位：Agent 运行态实现层 / 模式暴露面。
 * 核心目的：承载 mode Descriptor 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeModeExposureAudience =
  | "application"
  | "official-module"
  | "management"
  | "inspection"
  | "debug"
  | "external-control";

export type RuntimeModeExposureBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "registry"
  | "scope"
  | "visibility";

export type RuntimeModeExposureErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODE_ID"
  | "MISSING_MODE_REGISTRY"
  | "MISSING_TARGET_MODE"
  | "DUPLICATE_MODE_ID"
  | "DEFAULT_MODE_NOT_REGISTERED"
  | "ACTIVE_MODE_NOT_REGISTERED"
  | "MODE_NOT_REGISTERED"
  | "MODE_NOT_AVAILABLE"
  | "MODE_NOT_SWITCHABLE"
  | "REGISTRY_RUNTIME_MISMATCH"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "MODE_SCOPE_DENIED"
  | "MODE_NOT_VISIBLE";

export type RuntimeModeExposureGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeModeContractSummary = {
  contractId: string;
  version?: string;
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  errorCodes?: readonly string[];
};

export type RuntimeModeDescriptorInput = {
  modeId?: string;
  label?: string;
  summary?: string;
  audiences?: readonly RuntimeModeExposureAudience[];
  scopes?: readonly string[];
  default?: boolean;
  available?: boolean;
  switchable?: boolean;
  contract?: RuntimeModeContractSummary;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeModeDescriptor = {
  modeId: string;
  label?: string;
  summary?: string;
  audiences: readonly RuntimeModeExposureAudience[];
  scopes: readonly string[];
  default: boolean;
  available: boolean;
  switchable: boolean;
  contract?: RuntimeModeContractSummary;
  metadata?: Readonly<Record<string, unknown>>;
  descriptorSurface: "runtime.modeExposure.modeDescriptor";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeModeDescriptorRequest = {
  runtimeId?: string;
  mode?: RuntimeModeDescriptorInput;
  runtimeReady?: boolean;
  contract?: RuntimeModeExposureGate;
  governance?: RuntimeModeExposureGate;
};

export type RuntimeModeExposureError = {
  code: RuntimeModeExposureErrorCode;
  message: string;
  boundary: RuntimeModeExposureBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeModeExposureFailure = {
  ok: false;
  error: RuntimeModeExposureError;
  events: readonly string[];
};

export type RuntimeModeDescriptorResult =
  | {
      ok: true;
      runtimeId: string;
      descriptor: RuntimeModeDescriptor;
      events: readonly string[];
    }
  | RuntimeModeExposureFailure;

export const runtimeModeDescriptorCapability = {
  surface: "runtime.modeExposure",
  capability: "modeDescriptor",
  purpose: "normalize one readonly runtime execution mode descriptor for upper runtime surfaces",
  unsafeSideEffects: false,
} as const;

export function isRuntimeModeBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function cleanRuntimeModeList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function createRuntimeModeExposureError(
  code: RuntimeModeExposureErrorCode,
  message: string,
  boundary: RuntimeModeExposureBoundary,
): RuntimeModeExposureError {
  return {
    code,
    message,
    boundary,
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

export function rejectRuntimeModeExposure(
  code: RuntimeModeExposureErrorCode,
  message: string,
  boundary: RuntimeModeExposureBoundary,
  event = "runtime.modeExposure.rejected",
): RuntimeModeExposureFailure {
  return {
    ok: false,
    error: createRuntimeModeExposureError(code, message, boundary),
    events: [event],
  };
}

function normalizeContract(contract: RuntimeModeContractSummary | undefined): RuntimeModeContractSummary | undefined {
  if (contract === undefined || isRuntimeModeBlank(contract.contractId)) {
    return undefined;
  }

  return {
    contractId: contract.contractId.trim(),
    version: contract.version?.trim(),
    inputBoundary: cleanRuntimeModeList(contract.inputBoundary),
    outputBoundary: cleanRuntimeModeList(contract.outputBoundary),
    errorCodes: cleanRuntimeModeList(contract.errorCodes),
  };
}

export function normalizeRuntimeModeDescriptor(
  mode: RuntimeModeDescriptorInput | undefined,
): RuntimeModeDescriptor | RuntimeModeExposureError {
  if (mode === undefined || isRuntimeModeBlank(mode.modeId)) {
    return createRuntimeModeExposureError("MISSING_MODE_ID", "runtime mode descriptor requires a modeId", "input");
  }

  return {
    modeId: (mode.modeId ?? "").trim(),
    label: mode.label?.trim(),
    summary: mode.summary?.trim(),
    audiences: mode.audiences ?? ["application", "official-module", "management", "inspection"],
    scopes: cleanRuntimeModeList(mode.scopes),
    default: mode.default ?? false,
    available: mode.available ?? true,
    switchable: mode.switchable ?? true,
    contract: normalizeContract(mode.contract),
    metadata: mode.metadata,
    descriptorSurface: "runtime.modeExposure.modeDescriptor",
    governanceChecked: true,
    contractChecked: true,
    unsafeSideEffects: false,
  };
}

export function describeRuntimeMode(request: RuntimeModeDescriptorRequest = {}): RuntimeModeDescriptorResult {
  if (isRuntimeModeBlank(request.runtimeId)) {
    return rejectRuntimeModeExposure(
      "MISSING_RUNTIME_ID",
      "runtime mode descriptor requires a runtimeId",
      "input",
      "runtime.modeExposure.modeDescriptor.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeModeExposure(
      "RUNTIME_NOT_READY",
      "runtime mode descriptor requires a ready runtime",
      "runtime-state",
      "runtime.modeExposure.modeDescriptor.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeModeExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime mode descriptor was rejected by contract surface",
      "contract",
      "runtime.modeExposure.modeDescriptor.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeModeExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime mode descriptor was rejected by governance",
      "governance",
      "runtime.modeExposure.modeDescriptor.rejected",
    );
  }

  const descriptor = normalizeRuntimeModeDescriptor(request.mode);
  if ("code" in descriptor) {
    return {
      ok: false,
      error: descriptor,
      events: ["runtime.modeExposure.modeDescriptor.rejected"],
    };
  }

  return {
    ok: true,
    runtimeId: (request.runtimeId ?? "").trim(),
    descriptor,
    events: ["runtime.modeExposure.modeDescriptor.ready"],
  };
}
