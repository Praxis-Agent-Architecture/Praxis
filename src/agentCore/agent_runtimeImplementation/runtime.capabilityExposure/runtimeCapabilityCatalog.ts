/*
 * 文件定位：Agent 运行态实现层 / 能力暴露面。
 * 核心目的：承载 runtime Capability Catalog 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type RuntimeCapabilityKind = "agent" | "tool" | "model" | "interface" | "event" | "extension";

export type RuntimeCapabilityAudience = "application" | "official-module" | "management" | "inspection" | "debug";

export type RuntimeCapabilityExposureBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "catalog"
  | "scope";

export type RuntimeCapabilityExposureErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CATALOG"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CAPABILITY_KIND"
  | "DUPLICATE_CAPABILITY_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CATALOG_RUNTIME_MISMATCH"
  | "CAPABILITY_NOT_REGISTERED"
  | "CAPABILITY_SCOPE_DENIED"
  | "CAPABILITY_NOT_VISIBLE"
  | "CONTRACT_NOT_DECLARED";

export type RuntimeCapabilityExposureGate = {
  accepted: boolean;
  reason?: string;
};

export type RuntimeCapabilityExposureError = {
  code: RuntimeCapabilityExposureErrorCode;
  message: string;
  boundary: RuntimeCapabilityExposureBoundary;
  safeForApplication: true;
  internalDetailExposed: false;
};

export type RuntimeCapabilityExposureFailure = {
  ok: false;
  error: RuntimeCapabilityExposureError;
  events: readonly string[];
};

export type RuntimeCapabilityContractSummary = {
  contractId: string;
  version?: string;
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  errorCodes?: readonly string[];
};

export type RuntimeCapabilityDescriptor = {
  capabilityId?: string;
  kind?: RuntimeCapabilityKind;
  displayName?: string;
  summary?: string;
  surfaceId?: string;
  scopes?: readonly string[];
  audiences?: readonly RuntimeCapabilityAudience[];
  mounted?: boolean;
  enabled?: boolean;
  contract?: RuntimeCapabilityContractSummary;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeCapabilityCatalogEntry = {
  capabilityId: string;
  kind: RuntimeCapabilityKind;
  displayName?: string;
  summary?: string;
  surfaceId?: string;
  scopes: readonly string[];
  audiences: readonly RuntimeCapabilityAudience[];
  mounted: boolean;
  enabled: boolean;
  contract?: RuntimeCapabilityContractSummary;
};

export type RuntimeCapabilityCatalogSnapshot = {
  runtimeId: string;
  capabilities: readonly RuntimeCapabilityCatalogEntry[];
  requestedAudience?: RuntimeCapabilityAudience;
  catalogSurface: "runtime.capabilityExposure";
  governanceChecked: true;
  contractChecked: true;
  unsafeSideEffects: false;
};

export type RuntimeCapabilityCatalogRequest = {
  runtimeId?: string;
  capabilities?: readonly RuntimeCapabilityDescriptor[];
  audience?: RuntimeCapabilityAudience;
  runtimeReady?: boolean;
  contract?: RuntimeCapabilityExposureGate;
  governance?: RuntimeCapabilityExposureGate;
};

export type RuntimeCapabilityCatalogResult =
  | {
      ok: true;
      catalog: RuntimeCapabilityCatalogSnapshot;
      events: readonly string[];
    }
  | RuntimeCapabilityExposureFailure;

export function cleanRuntimeCapabilityList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function isRuntimeCapabilityBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

export function runtimeCapabilityExposureError(
  code: RuntimeCapabilityExposureErrorCode,
  message: string,
  boundary: RuntimeCapabilityExposureBoundary,
): RuntimeCapabilityExposureError {
  return {
    code,
    message,
    boundary,
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

export function rejectRuntimeCapabilityExposure(
  code: RuntimeCapabilityExposureErrorCode,
  message: string,
  boundary: RuntimeCapabilityExposureBoundary,
  event = "runtime.capability.exposure.rejected",
): RuntimeCapabilityExposureFailure {
  return {
    ok: false,
    error: runtimeCapabilityExposureError(code, message, boundary),
    events: [event],
  };
}

function normalizeContract(contract: RuntimeCapabilityContractSummary | undefined): RuntimeCapabilityContractSummary | undefined {
  if (contract === undefined || isRuntimeCapabilityBlank(contract.contractId)) {
    return undefined;
  }

  return {
    contractId: contract.contractId.trim(),
    version: contract.version?.trim(),
    inputBoundary: cleanRuntimeCapabilityList(contract.inputBoundary),
    outputBoundary: cleanRuntimeCapabilityList(contract.outputBoundary),
    errorCodes: cleanRuntimeCapabilityList(contract.errorCodes),
  };
}

function normalizeCapability(
  descriptor: RuntimeCapabilityDescriptor,
): RuntimeCapabilityCatalogEntry | RuntimeCapabilityExposureError {
  if (isRuntimeCapabilityBlank(descriptor.capabilityId)) {
    return runtimeCapabilityExposureError(
      "MISSING_CAPABILITY_ID",
      "runtime capability catalog entries require a capabilityId",
      "input",
    );
  }

  if (descriptor.kind === undefined) {
    return runtimeCapabilityExposureError(
      "MISSING_CAPABILITY_KIND",
      "runtime capability catalog entries require an explicit capability kind",
      "input",
    );
  }

  return {
    capabilityId: (descriptor.capabilityId ?? "").trim(),
    kind: descriptor.kind,
    displayName: descriptor.displayName?.trim(),
    summary: descriptor.summary?.trim(),
    surfaceId: descriptor.surfaceId?.trim(),
    scopes: cleanRuntimeCapabilityList(descriptor.scopes),
    audiences: descriptor.audiences ?? ["application", "official-module", "management"],
    mounted: descriptor.mounted ?? true,
    enabled: descriptor.enabled ?? true,
    contract: normalizeContract(descriptor.contract),
  };
}

function visibleToAudience(entry: RuntimeCapabilityCatalogEntry, audience: RuntimeCapabilityAudience | undefined): boolean {
  return audience === undefined || entry.audiences.includes(audience);
}

export function buildRuntimeCapabilityCatalog(
  request: RuntimeCapabilityCatalogRequest = {},
): RuntimeCapabilityCatalogResult {
  if (isRuntimeCapabilityBlank(request.runtimeId)) {
    return rejectRuntimeCapabilityExposure(
      "MISSING_RUNTIME_ID",
      "runtime capability catalog requires a runtimeId",
      "input",
      "runtime.capability.catalog.rejected",
    );
  }

  if (request.runtimeReady === false) {
    return rejectRuntimeCapabilityExposure(
      "RUNTIME_NOT_READY",
      "runtime capability catalog requires a ready runtime",
      "runtime-state",
      "runtime.capability.catalog.rejected",
    );
  }

  if (request.contract?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime capability catalog was rejected by contract surface",
      "contract",
      "runtime.capability.catalog.rejected",
    );
  }

  if (request.governance?.accepted === false) {
    return rejectRuntimeCapabilityExposure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime capability catalog was rejected by governance",
      "governance",
      "runtime.capability.catalog.rejected",
    );
  }

  const seenCapabilityIds = new Set<string>();
  const capabilities: RuntimeCapabilityCatalogEntry[] = [];

  for (const descriptor of request.capabilities ?? []) {
    const normalized = normalizeCapability(descriptor);
    if ("code" in normalized) {
      return {
        ok: false,
        error: normalized,
        events: ["runtime.capability.catalog.rejected"],
      };
    }

    if (seenCapabilityIds.has(normalized.capabilityId)) {
      return rejectRuntimeCapabilityExposure(
        "DUPLICATE_CAPABILITY_ID",
        `runtime capability catalog received duplicate capabilityId: ${normalized.capabilityId}`,
        "catalog",
        "runtime.capability.catalog.rejected",
      );
    }

    seenCapabilityIds.add(normalized.capabilityId);
    if (visibleToAudience(normalized, request.audience)) {
      capabilities.push(normalized);
    }
  }

  return {
    ok: true,
    catalog: {
    runtimeId: (request.runtimeId ?? "").trim(),
      capabilities,
      requestedAudience: request.audience,
      catalogSurface: "runtime.capabilityExposure",
      governanceChecked: true,
      contractChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.capability.catalog.ready"],
  };
}
