/*
 * 文件定位：Agent 运行态实现层 / 能力暴露面。
 * 核心目的：承载 capability Contract Exposer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  isRuntimeCapabilityBlank,
  rejectRuntimeCapabilityExposure,
  type RuntimeCapabilityAudience,
  type RuntimeCapabilityCatalogEntry,
  type RuntimeCapabilityCatalogSnapshot,
  type RuntimeCapabilityExposureFailure,
  type RuntimeCapabilityExposureGate,
} from "./runtimeCapabilityCatalog.js";

export type ExposedCapabilityContract = {
  runtimeId: string;
  capabilityId: string;
  kind: RuntimeCapabilityCatalogEntry["kind"];
  contractId: string;
  version?: string;
  surfaceId?: string;
  scopes: readonly string[];
  audiences: readonly RuntimeCapabilityAudience[];
  inputBoundary: readonly string[];
  outputBoundary: readonly string[];
  errorCodes: readonly string[];
  contractSurface: "runtime.capabilityExposure.capabilityContractExposer";
  governanceRequired: true;
  rawProviderFieldsExposed: false;
  unsafeSideEffects: false;
};

export type CapabilityContractExposerRequest = {
  runtimeId?: string;
  capabilityId?: string;
  catalog?: RuntimeCapabilityCatalogSnapshot;
  audience?: RuntimeCapabilityAudience;
  runtimeReady?: boolean;
  contract?: RuntimeCapabilityExposureGate;
  governance?: RuntimeCapabilityExposureGate;
};

export type CapabilityContractExposerResult =
  | {
      ok: true;
      exposedContract: ExposedCapabilityContract;
      events: readonly string[];
    }
  | RuntimeCapabilityExposureFailure;

function findCapability(
  catalog: RuntimeCapabilityCatalogSnapshot,
  capabilityId: string,
): RuntimeCapabilityCatalogEntry | undefined {
  return catalog.capabilities.find((capability) => capability.capabilityId === capabilityId);
}

export function exposeCapabilityContract(
  request: CapabilityContractExposerRequest = {},
): CapabilityContractExposerResult {
  if (isRuntimeCapabilityBlank(request.runtimeId)) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_RUNTIME_ID",
      "capability contract exposer requires a runtimeId",
      "input",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (isRuntimeCapabilityBlank(request.capabilityId)) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_CAPABILITY_ID",
      "capability contract exposer requires a capabilityId",
      "input",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (request.catalog === undefined) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_CATALOG",
      "capability contract exposer requires a runtime capability catalog",
      "input",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeCapabilityExposure(
      "RUNTIME_NOT_READY",
      "capability contracts can only be exposed for a ready runtime",
      "runtime-state",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "capability contract exposure was rejected by contract surface",
      "contract",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "capability contract exposure was rejected by governance",
      "governance",
      "runtime.capability.contractExposure.rejected",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  if (request.catalog.runtimeId !== runtimeId) {
    return rejectRuntimeCapabilityExposure(
      "CATALOG_RUNTIME_MISMATCH",
      "capability contract exposer received a catalog for a different runtime",
      "catalog",
      "runtime.capability.contractExposure.rejected",
    );
  }

  const capabilityId = (request.capabilityId ?? "").trim();
  const entry = findCapability(request.catalog, capabilityId);
  if (entry === undefined) {
    return rejectRuntimeCapabilityExposure(
      "CAPABILITY_NOT_REGISTERED",
      `capability is not registered in the runtime catalog: ${capabilityId}`,
      "catalog",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (request.audience !== undefined && !entry.audiences.includes(request.audience)) {
    return rejectRuntimeCapabilityExposure(
      "CAPABILITY_NOT_VISIBLE",
      `capability contract is not visible to audience: ${request.audience}`,
      "scope",
      "runtime.capability.contractExposure.rejected",
    );
  }

  if (entry.contract === undefined) {
    return rejectRuntimeCapabilityExposure(
      "CONTRACT_NOT_DECLARED",
      `capability does not declare an exposable contract: ${capabilityId}`,
      "contract",
      "runtime.capability.contractExposure.rejected",
    );
  }

  return {
    ok: true,
    exposedContract: {
      runtimeId,
      capabilityId,
      kind: entry.kind,
      contractId: entry.contract.contractId,
      version: entry.contract.version,
      surfaceId: entry.surfaceId,
      scopes: entry.scopes,
      audiences: entry.audiences,
      inputBoundary: entry.contract.inputBoundary ?? [],
      outputBoundary: entry.contract.outputBoundary ?? [],
      errorCodes: entry.contract.errorCodes ?? [],
      contractSurface: "runtime.capabilityExposure.capabilityContractExposer",
      governanceRequired: true,
      rawProviderFieldsExposed: false,
      unsafeSideEffects: false,
    },
    events: ["runtime.capability.contractExposure.exposed"],
  };
}
