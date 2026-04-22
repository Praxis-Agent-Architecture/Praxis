/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 model Capability Bridge 这一能力位点。
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

export type RuntimeModelCapabilityKind =
  | "text-generation"
  | "tool-call"
  | "embedding"
  | "multimodal"
  | "streaming"
  | (string & {});

export type ModelCapabilityBridgeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "bridge"
  | "scope";

export type ModelCapabilityBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CAPABILITIES"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CAPABILITY_KIND"
  | "MISSING_BRIDGE_REF"
  | "DUPLICATE_CAPABILITY_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type ModelCapabilityBridgeError = {
  code: ModelCapabilityBridgeErrorCode;
  message: string;
  boundary: ModelCapabilityBridgeBoundary;
  publicSafe: true;
};

export type RuntimeModelCapabilityInput = {
  capabilityId?: string;
  kind?: RuntimeModelCapabilityKind;
  bridgeRef?: string;
  invocationSurface?: "modelInvocationRuntime" | (string & {});
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelCapabilityBridgeRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  capabilities?: readonly RuntimeModelCapabilityInput[];
  runtimeReady?: boolean;
  allowedScopes?: readonly string[];
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type RuntimeModelCapabilityRef = {
  capabilityId: string;
  kind: RuntimeModelCapabilityKind;
  bridgeRef: string;
  invocationSurface: "modelInvocationRuntime" | (string & {});
  scopes: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

export type ModelCapabilityBridge = {
  bridgeId: string;
  runtimeId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter.modelCapabilityBridge";
  capabilities: readonly RuntimeModelCapabilityRef[];
  capabilityIds: readonly string[];
  capabilityKinds: readonly RuntimeModelCapabilityKind[];
  grantedScopes: readonly string[];
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ModelCapabilityBridgeResult =
  | {
      ok: true;
      bridge: ModelCapabilityBridge;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelCapabilityBridgeError;
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
  code: ModelCapabilityBridgeErrorCode,
  message: string,
  boundary: ModelCapabilityBridgeBoundary,
): ModelCapabilityBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.modelCapabilityBridge.rejected"],
  };
}

function normalizeCapability(
  capability: RuntimeModelCapabilityInput,
): RuntimeModelCapabilityRef | ModelCapabilityBridgeResult {
  if (!hasText(capability.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "model capability bridge requires every capability to have an id", "bridge");
  }

  if (!hasText(capability.kind)) {
    return failure("MISSING_CAPABILITY_KIND", "model capability bridge requires every capability to name a kind", "bridge");
  }

  if (!hasText(capability.bridgeRef)) {
    return failure(
      "MISSING_BRIDGE_REF",
      "model capability bridge requires a bridged model capability reference",
      "bridge",
    );
  }

  const invocationSurface = capability.invocationSurface?.trim();

  return {
    capabilityId: capability.capabilityId.trim(),
    kind: capability.kind.trim(),
    bridgeRef: capability.bridgeRef.trim(),
    invocationSurface:
      invocationSurface !== undefined && invocationSurface.length > 0
        ? invocationSurface
        : "modelInvocationRuntime",
    scopes: cleanList(capability.scopes),
    metadata: capability.metadata ?? {},
  };
}

export function bridgeModelCapabilities(
  request?: ModelCapabilityBridgeRequest,
): ModelCapabilityBridgeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "model capability bridge requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "model capability bridge requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "model capabilities can only be bridged through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "model capability bridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "model capability bridge was rejected by governance",
      "governance",
    );
  }

  if ((request.capabilities ?? []).length === 0) {
    return failure(
      "MISSING_CAPABILITIES",
      "model capability bridge requires at least one bridged capability",
      "input",
    );
  }

  const capabilities: RuntimeModelCapabilityRef[] = [];
  const seenCapabilityIds = new Set<string>();
  for (const capability of request.capabilities ?? []) {
    const normalized = normalizeCapability(capability);
    if ("ok" in normalized) {
      return normalized;
    }

    if (seenCapabilityIds.has(normalized.capabilityId)) {
      return failure(
        "DUPLICATE_CAPABILITY_ID",
        `model capability bridge received duplicate capabilityId: ${normalized.capabilityId}`,
        "bridge",
      );
    }

    seenCapabilityIds.add(normalized.capabilityId);
    capabilities.push(normalized);
  }

  const allowedScopes = cleanList(request.allowedScopes);
  const requestedScopes = cleanList(capabilities.flatMap((capability) => capability.scopes));
  const deniedScopes =
    allowedScopes.length === 0
      ? []
      : requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (deniedScopes.length > 0) {
    return failure(
      "SCOPE_DENIED",
      `model capability bridge includes scopes outside governance: ${deniedScopes.join(", ")}`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId.trim();

  return {
    ok: true,
    bridge: {
      bridgeId: `${runtimeId}:modelCapabilityBridge`,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.modelAdapter.modelCapabilityBridge",
      capabilities,
      capabilityIds: capabilities.map((capability) => capability.capabilityId),
      capabilityKinds: [...new Set(capabilities.map((capability) => capability.kind))],
      grantedScopes: requestedScopes,
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.modelCapabilityBridge.bridged"],
  };
}
