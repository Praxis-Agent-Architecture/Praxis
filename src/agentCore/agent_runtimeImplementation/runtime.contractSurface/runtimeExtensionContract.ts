/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Extension Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeContractBoundary, RuntimeContractError, RuntimeContractGate } from "./runtimeErrorContract.js";

export type RuntimeExtensionKind = "official-module" | "application-plugin" | "adapter" | "inspection-hook";

export type RuntimeExtensionMountSurface =
  | "applicationSurface"
  | "officialModuleSurface"
  | "governancePlane"
  | "invocationMethod"
  | "inspection"
  | "debug";

export type RuntimeExtensionContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTRACT_ID"
  | "MISSING_EXTENSION_ID"
  | "MISSING_MOUNT_SURFACE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "EXTENSION_SCOPE_DENIED";

export type RuntimeExtensionContractRequest = {
  runtimeId: string;
  contractId: string;
  extensionId: string;
  kind?: RuntimeExtensionKind;
  mountSurface?: RuntimeExtensionMountSurface;
  allowedMountSurfaces?: readonly RuntimeExtensionMountSurface[];
  requiredCapabilities?: readonly string[];
  exposedEvents?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimeExtensionMountPlan = {
  extensionId: string;
  mountSurface: RuntimeExtensionMountSurface;
  dryRun: true;
  requiresGovernance: true;
};

export type RuntimeExtensionContract = {
  runtimeId: string;
  contractId: string;
  extensionId: string;
  kind: RuntimeExtensionKind;
  mountPlan: RuntimeExtensionMountPlan;
  requiredCapabilities: readonly string[];
  exposedEvents: readonly string[];
  contractSurface: "runtime.contractSurface";
  internalRuntimeStateExposed: false;
  unsafeSideEffects: false;
};

export type RuntimeExtensionContractResult =
  | {
      ok: true;
      extension: RuntimeExtensionContract;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeContractError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function runtimeError(
  code: RuntimeExtensionContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeContractError {
  return {
    code,
    message,
    boundary,
    severity: "recoverable",
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

function failure(
  code: RuntimeExtensionContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeExtensionContractResult {
  return {
    ok: false,
    error: runtimeError(code, message, boundary),
    events: ["runtime.extension.contract.rejected"],
  };
}

export function defineRuntimeExtensionContract(
  request: RuntimeExtensionContractRequest,
): RuntimeExtensionContractResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before defining a runtime extension contract", "input");
  }

  if (isBlank(request.contractId)) {
    return failure("MISSING_CONTRACT_ID", "contractId is required before defining a runtime extension contract", "input");
  }

  if (isBlank(request.extensionId)) {
    return failure("MISSING_EXTENSION_ID", "extensionId is required before defining a runtime extension contract", "input");
  }

  if (request.mountSurface === undefined) {
    return failure(
      "MISSING_MOUNT_SURFACE",
      "mountSurface is required before planning a runtime extension mount",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime extension contracts require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime extension contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime extension contract was rejected by governance",
      "governance",
    );
  }

  if (
    request.allowedMountSurfaces !== undefined &&
    !request.allowedMountSurfaces.includes(request.mountSurface)
  ) {
    return failure(
      "EXTENSION_SCOPE_DENIED",
      `extension mount surface ${request.mountSurface} is outside the runtime extension scope`,
      "scope",
    );
  }

  const extensionId = request.extensionId.trim();

  return {
    ok: true,
    extension: {
      runtimeId: request.runtimeId.trim(),
      contractId: request.contractId.trim(),
      extensionId,
      kind: request.kind ?? "application-plugin",
      mountPlan: {
        extensionId,
        mountSurface: request.mountSurface,
        dryRun: true,
        requiresGovernance: true,
      },
      requiredCapabilities: cleanList(request.requiredCapabilities),
      exposedEvents: cleanList(request.exposedEvents),
      contractSurface: "runtime.contractSurface",
      internalRuntimeStateExposed: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.extension.contract.defined"],
  };
}
