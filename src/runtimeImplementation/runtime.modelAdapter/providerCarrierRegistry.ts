/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 provider Carrier Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ModelAdapterRuntimeCaller,
  ModelAdapterRuntimeGate,
} from "./modelAdapterRuntime.js";
import type { RaxAuthRef, RaxReasoningEffort } from "../../modelAdapter/index.js";

export type ProviderCachePolicy = {
  intent: "none" | "read" | "write" | "read-write" | (string & {});
  ttlSeconds?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CredentialRef = RaxAuthRef & {
  credentialId?: string;
  credentialType?: string;
  provider?: string;
};

export type ProviderReasoningConfig = {
  effort?: RaxReasoningEffort;
  summary?: string;
};

export type ProviderCarrierKind =
  | "openai"
  | "anthropic"
  | "deepmind"
  | "customFormat"
  | (string & {});

export type ProviderCarrierEndpointShape =
  | "responses"
  | "messages"
  | "completion"
  | "embedding"
  | "image"
  | "audio"
  | "realtime"
  | "video"
  | "files"
  | "vector-store"
  | "skills"
  | "custom"
  | (string & {});

export type ProviderCarrierRegistryBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "registry"
  | "scope";

export type ProviderCarrierRegistryErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CARRIERS"
  | "MISSING_CARRIER_ID"
  | "MISSING_PROVIDER"
  | "DUPLICATE_CARRIER_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type ProviderCarrierRegistryError = {
  code: ProviderCarrierRegistryErrorCode;
  message: string;
  boundary: ProviderCarrierRegistryBoundary;
  publicSafe: true;
};

export type ProviderCarrierInput = {
  carrierId?: string;
  provider?: ProviderCarrierKind;
  endpointShape?: ProviderCarrierEndpointShape;
  baseURL?: string;
  model?: string;
  reasoning?: ProviderReasoningConfig;
  credentialRef?: CredentialRef;
  cachePolicy?: ProviderCachePolicy;
  capabilities?: readonly string[];
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ProviderCarrierRegistryRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  carriers?: readonly ProviderCarrierInput[];
  runtimeReady?: boolean;
  allowedScopes?: readonly string[];
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type RegisteredProviderCarrier = {
  carrierId: string;
  provider: ProviderCarrierKind;
  endpointShape?: ProviderCarrierEndpointShape;
  baseURL?: string;
  model?: string;
  reasoning?: ProviderReasoningConfig;
  credentialRef?: CredentialRef;
  cachePolicy: ProviderCachePolicy;
  capabilities: readonly string[];
  scopes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  status: "registered";
};

export type ProviderCarrierRegistry = {
  registryId: string;
  runtimeId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter.providerCarrierRegistry";
  carriers: readonly RegisteredProviderCarrier[];
  carrierIds: readonly string[];
  providers: readonly ProviderCarrierKind[];
  capabilities: readonly string[];
  grantedScopes: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ProviderCarrierRegistryResult =
  | {
      ok: true;
      registry: ProviderCarrierRegistry;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ProviderCarrierRegistryError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: ModelAdapterRuntimeCaller): ModelAdapterRuntimeCaller {
  const normalized: ModelAdapterRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: ProviderCarrierRegistryErrorCode,
  message: string,
  boundary: ProviderCarrierRegistryBoundary,
): ProviderCarrierRegistryResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.providerCarrierRegistry.rejected"],
  };
}

function normalizeCarrier(carrier: ProviderCarrierInput): RegisteredProviderCarrier | ProviderCarrierRegistryResult {
  if (!hasText(carrier.carrierId)) {
    return failure("MISSING_CARRIER_ID", "provider carrier registry requires every carrier to have an id", "registry");
  }

  if (!hasText(carrier.provider)) {
    return failure("MISSING_PROVIDER", "provider carrier registry requires every carrier to name a provider", "registry");
  }

  const endpointShape = carrier.endpointShape?.trim();
  const normalized: RegisteredProviderCarrier = {
    carrierId: carrier.carrierId.trim(),
    provider: carrier.provider.trim(),
    capabilities: cleanList(carrier.capabilities),
    scopes: cleanList(carrier.scopes),
    cachePolicy: carrier.cachePolicy ?? { intent: "none" },
    metadata: carrier.metadata ?? {},
    status: "registered",
  };

  if (endpointShape !== undefined && endpointShape.length > 0) {
    normalized.endpointShape = endpointShape;
  }

  const baseURL = carrier.baseURL?.trim().replace(/\/+$/, "");
  if (baseURL !== undefined && baseURL.length > 0) {
    normalized.baseURL = baseURL;
  }

  const model = carrier.model?.trim();
  if (model !== undefined && model.length > 0) {
    normalized.model = model;
  }

  if (carrier.reasoning !== undefined) {
    normalized.reasoning = {
      effort: carrier.reasoning.effort?.trim() || undefined,
      summary: carrier.reasoning.summary?.trim() || undefined,
    };
  }

  if (carrier.credentialRef !== undefined) {
    normalized.credentialRef = carrier.credentialRef;
  }

  return normalized;
}

export function registerProviderCarriers(
  request?: ProviderCarrierRegistryRequest,
): ProviderCarrierRegistryResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "provider carrier registry requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "provider carrier registry requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "provider carriers can only be registered through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "provider carrier registry was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "provider carrier registry was rejected by governance",
      "governance",
    );
  }

  if ((request.carriers ?? []).length === 0) {
    return failure("MISSING_CARRIERS", "provider carrier registry requires at least one carrier", "input");
  }

  const carriers: RegisteredProviderCarrier[] = [];
  const seenCarrierIds = new Set<string>();
  for (const carrier of request.carriers ?? []) {
    const normalized = normalizeCarrier(carrier);
    if ("ok" in normalized) {
      return normalized;
    }

    if (seenCarrierIds.has(normalized.carrierId)) {
      return failure(
        "DUPLICATE_CARRIER_ID",
        `provider carrier registry received duplicate carrierId: ${normalized.carrierId}`,
        "registry",
      );
    }

    seenCarrierIds.add(normalized.carrierId);
    carriers.push(normalized);
  }

  const allowedScopes = cleanList(request.allowedScopes);
  const requestedScopes = cleanList(carriers.flatMap((carrier) => carrier.scopes));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `provider carrier registry includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    registry: {
      registryId: `${runtimeId}:providerCarrierRegistry`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.modelAdapter.providerCarrierRegistry",
      carriers,
      carrierIds: carriers.map((carrier) => carrier.carrierId),
      providers: [...new Set(carriers.map((carrier) => carrier.provider))],
      capabilities: cleanList(carriers.flatMap((carrier) => carrier.capabilities)),
      grantedScopes: requestedScopes,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.providerCarrierRegistry.registered"],
  };
}
