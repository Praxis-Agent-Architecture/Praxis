/*
 * 文件定位：Agent 运行态实现层 / 能力暴露面。
 * 核心目的：承载 capability Exposure Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  probeCapabilityAvailability,
  type CapabilityAvailability,
} from "./capabilityAvailabilityProbe.js";
import { exposeCapabilityContract, type ExposedCapabilityContract } from "./capabilityContractExposer.js";
import {
  buildRuntimeCapabilityCatalog,
  cleanRuntimeCapabilityList,
  type RuntimeCapabilityAudience,
  type RuntimeCapabilityCatalogSnapshot,
  type RuntimeCapabilityDescriptor,
  type RuntimeCapabilityExposureError,
  type RuntimeCapabilityExposureFailure,
  type RuntimeCapabilityExposureGate,
} from "./runtimeCapabilityCatalog.js";

export type CapabilityExposureRuntimeRequest = {
  runtimeId?: string;
  capabilities?: readonly RuntimeCapabilityDescriptor[];
  capabilityIds?: readonly string[];
  audience?: RuntimeCapabilityAudience;
  requestedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeCapabilityExposureGate;
  governance?: RuntimeCapabilityExposureGate;
};

export type CapabilityExposureRuntimeSnapshot = {
  runtimeId: string;
  catalog: RuntimeCapabilityCatalogSnapshot;
  availability: readonly CapabilityAvailability[];
  contracts: readonly ExposedCapabilityContract[];
  contractErrors: readonly RuntimeCapabilityExposureError[];
  runtimeSurface: "runtime.capabilityExposure";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type CapabilityExposureRuntimeResult =
  | {
      ok: true;
      exposure: CapabilityExposureRuntimeSnapshot;
      events: readonly string[];
    }
  | RuntimeCapabilityExposureFailure;

function selectCapabilityIds(
  catalog: RuntimeCapabilityCatalogSnapshot,
  requestedCapabilityIds: readonly string[] | undefined,
): readonly string[] {
  const requested = cleanRuntimeCapabilityList(requestedCapabilityIds);
  if (requested.length === 0) {
    return catalog.capabilities.map((capability) => capability.capabilityId);
  }

  return requested;
}

export function createCapabilityExposureRuntimeSnapshot(
  request: CapabilityExposureRuntimeRequest = {},
): CapabilityExposureRuntimeResult {
  const catalogResult = buildRuntimeCapabilityCatalog({
    runtimeId: request.runtimeId,
    capabilities: request.capabilities,
    audience: request.audience,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
  });

  if (!catalogResult.ok) {
    return catalogResult;
  }

  const capabilityIds = selectCapabilityIds(catalogResult.catalog, request.capabilityIds);
  const availability: CapabilityAvailability[] = [];
  const contracts: ExposedCapabilityContract[] = [];
  const contractErrors: RuntimeCapabilityExposureError[] = [];
  const events: string[] = [...catalogResult.events];

  for (const capabilityId of capabilityIds) {
    const availabilityResult = probeCapabilityAvailability({
      runtimeId: catalogResult.catalog.runtimeId,
      capabilityId,
      catalog: catalogResult.catalog,
      requestedScopes: request.requestedScopes,
      runtimeReady: request.runtimeReady,
      contract: request.contract,
      governance: request.governance,
    });

    events.push(...availabilityResult.events);
    if (availabilityResult.ok) {
      availability.push(availabilityResult.availability);
    }

    const contractResult = exposeCapabilityContract({
      runtimeId: catalogResult.catalog.runtimeId,
      capabilityId,
      catalog: catalogResult.catalog,
      audience: request.audience,
      runtimeReady: request.runtimeReady,
      contract: request.contract,
      governance: request.governance,
    });

    events.push(...contractResult.events);
    if (contractResult.ok) {
      contracts.push(contractResult.exposedContract);
    } else {
      contractErrors.push(contractResult.error);
    }
  }

  return {
    ok: true,
    exposure: {
      runtimeId: catalogResult.catalog.runtimeId,
      catalog: catalogResult.catalog,
      availability,
      contracts,
      contractErrors,
      runtimeSurface: "runtime.capabilityExposure",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events,
  };
}
