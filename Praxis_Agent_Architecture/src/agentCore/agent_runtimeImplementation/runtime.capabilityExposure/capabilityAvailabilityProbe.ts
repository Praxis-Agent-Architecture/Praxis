/*
 * 文件定位：Agent 运行态实现层 / 能力暴露面。
 * 核心目的：承载 capability Availability Probe 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  cleanRuntimeCapabilityList,
  isRuntimeCapabilityBlank,
  rejectRuntimeCapabilityExposure,
  type RuntimeCapabilityCatalogEntry,
  type RuntimeCapabilityCatalogSnapshot,
  type RuntimeCapabilityExposureFailure,
  type RuntimeCapabilityExposureGate,
} from "./runtimeCapabilityCatalog.js";

export type CapabilityAvailabilityStatus = "available" | "unavailable" | "denied";

export type CapabilityAvailabilityProbeRequest = {
  runtimeId?: string;
  capabilityId?: string;
  catalog?: RuntimeCapabilityCatalogSnapshot;
  requestedScopes?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeCapabilityExposureGate;
  governance?: RuntimeCapabilityExposureGate;
};

export type CapabilityAvailability = {
  runtimeId: string;
  capabilityId: string;
  kind: RuntimeCapabilityCatalogEntry["kind"];
  status: CapabilityAvailabilityStatus;
  reasons: readonly string[];
  requestedScopes: readonly string[];
  missingScopes: readonly string[];
  mounted: boolean;
  enabled: boolean;
  contractId?: string;
  probeSurface: "runtime.capabilityExposure.capabilityAvailabilityProbe";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type CapabilityAvailabilityProbeResult =
  | {
      ok: true;
      availability: CapabilityAvailability;
      events: readonly string[];
    }
  | RuntimeCapabilityExposureFailure;

function findCapability(
  catalog: RuntimeCapabilityCatalogSnapshot,
  capabilityId: string,
): RuntimeCapabilityCatalogEntry | undefined {
  return catalog.capabilities.find((capability) => capability.capabilityId === capabilityId);
}

function missingScopes(entry: RuntimeCapabilityCatalogEntry, requestedScopes: readonly string[]): readonly string[] {
  return requestedScopes.filter((scope) => !entry.scopes.includes(scope));
}

function availabilityStatus(
  entry: RuntimeCapabilityCatalogEntry,
  deniedScopes: readonly string[],
): CapabilityAvailabilityStatus {
  if (deniedScopes.length > 0) {
    return "denied";
  }

  if (!entry.mounted || !entry.enabled) {
    return "unavailable";
  }

  return "available";
}

function availabilityReasons(
  entry: RuntimeCapabilityCatalogEntry,
  deniedScopes: readonly string[],
): readonly string[] {
  const reasons: string[] = [];

  if (!entry.mounted) {
    reasons.push("capability is declared but its owning module is not mounted");
  }

  if (!entry.enabled) {
    reasons.push("capability is declared but currently disabled");
  }

  if (deniedScopes.length > 0) {
    reasons.push(`caller is missing required scope: ${deniedScopes.join(", ")}`);
  }

  return reasons;
}

export function probeCapabilityAvailability(
  request: CapabilityAvailabilityProbeRequest = {},
): CapabilityAvailabilityProbeResult {
  if (isRuntimeCapabilityBlank(request.runtimeId)) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_RUNTIME_ID",
      "capability availability probe requires a runtimeId",
      "input",
      "runtime.capability.availability.rejected",
    );
  }

  if (isRuntimeCapabilityBlank(request.capabilityId)) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_CAPABILITY_ID",
      "capability availability probe requires a capabilityId",
      "input",
      "runtime.capability.availability.rejected",
    );
  }

  if (request.catalog === undefined) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_CATALOG",
      "capability availability probe requires a runtime capability catalog",
      "input",
      "runtime.capability.availability.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeCapabilityExposure(
      "RUNTIME_NOT_READY",
      "capability availability can only be probed on a ready runtime",
      "runtime-state",
      "runtime.capability.availability.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "capability availability probe was rejected by contract surface",
      "contract",
      "runtime.capability.availability.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "capability availability probe was rejected by governance",
      "governance",
      "runtime.capability.availability.rejected",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  if (request.catalog.runtimeId !== runtimeId) {
    return rejectRuntimeCapabilityExposure(
      "CATALOG_RUNTIME_MISMATCH",
      "capability availability probe received a catalog for a different runtime",
      "catalog",
      "runtime.capability.availability.rejected",
    );
  }

  const capabilityId = (request.capabilityId ?? "").trim();
  const entry = findCapability(request.catalog, capabilityId);
  if (entry === undefined) {
    return rejectRuntimeCapabilityExposure(
      "CAPABILITY_NOT_REGISTERED",
      `capability is not registered in the runtime catalog: ${capabilityId}`,
      "catalog",
      "runtime.capability.availability.rejected",
    );
  }

  const requestedScopes = cleanRuntimeCapabilityList(request.requestedScopes);
  const deniedScopes = missingScopes(entry, requestedScopes);
  const status = availabilityStatus(entry, deniedScopes);

  return {
    ok: true,
    availability: {
      runtimeId,
      capabilityId,
      kind: entry.kind,
      status,
      reasons: availabilityReasons(entry, deniedScopes),
      requestedScopes,
      missingScopes: deniedScopes,
      mounted: entry.mounted,
      enabled: entry.enabled,
      contractId: entry.contract?.contractId,
      probeSurface: "runtime.capabilityExposure.capabilityAvailabilityProbe",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: [`runtime.capability.availability.${status}`],
  };
}
