/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 output Interface Capability 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OutputInterfaceCapabilityBoundary = "input" | "contract" | "governance" | "scope" | "compatibility";

export type OutputInterfaceCapabilityGate = {
  accepted: boolean;
  reason?: string;
};

export type OutputInterfaceCapabilityDeclaration = {
  capabilityId?: string;
  providerKey?: string;
  description?: string;
  required?: boolean;
  available?: boolean;
  limits?: readonly string[];
  evidence?: readonly string[];
};

export type OutputInterfaceCapabilityRequest = {
  runtimeId?: string;
  sourceInterfaceId?: string;
  providerId?: string;
  modelId?: string;
  capabilities?: readonly OutputInterfaceCapabilityDeclaration[];
  requiredCapabilities?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: OutputInterfaceCapabilityGate;
  governance?: OutputInterfaceCapabilityGate;
};

export type OutputInterfaceCapabilityErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_CAPABILITY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type OutputInterfaceCapabilityError = {
  code: OutputInterfaceCapabilityErrorCode;
  message: string;
  boundary: OutputInterfaceCapabilityBoundary;
  safeForRuntimeInspection: true;
};

export type NormalizedOutputInterfaceCapability = {
  capabilityId: string;
  providerKey?: string;
  description?: string;
  required: boolean;
  available: boolean;
  limits: readonly string[];
  evidence: readonly string[];
};

export type OutputInterfaceCapabilityEnvelope = {
  kind: "agentCore.modelAdapter.outputInterfaceCapability";
  runtimeId: string;
  sourceInterfaceId: string;
  providerId?: string;
  modelId?: string;
  capabilities: readonly NormalizedOutputInterfaceCapability[];
  requiredCapabilities: readonly string[];
  missingCapabilities: readonly string[];
  compatible: boolean;
  acceptedScopes: readonly string[];
  bridgeReadiness: "ready" | "blocked-by-missing-capability";
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type OutputInterfaceCapabilityResult =
  | {
      ok: true;
      envelope: OutputInterfaceCapabilityEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OutputInterfaceCapabilityError;
      events: readonly string[];
    };

export const outputInterfaceCapabilityDescriptor = {
  capability: "output-interface-capability",
  route: "agent_modelAdapter.abstractionLayer.capabilityCompatibilityCore",
  purpose: "normalize provider output capability signals without freezing provider fields as agentCore schema",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: OutputInterfaceCapabilityErrorCode,
  message: string,
  boundary: OutputInterfaceCapabilityBoundary,
): OutputInterfaceCapabilityResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.outputInterfaceCapability.rejected"],
  };
}

function normalizeCapabilities(
  capabilities: readonly OutputInterfaceCapabilityDeclaration[] | undefined,
): NormalizedOutputInterfaceCapability[] | OutputInterfaceCapabilityResult {
  const normalized: NormalizedOutputInterfaceCapability[] = [];

  for (const capability of capabilities ?? []) {
    const capabilityId = capability.capabilityId?.trim();
    if (!capabilityId) {
      return failure("MISSING_CAPABILITY", "output interface capability entries require capabilityId", "input");
    }

    normalized.push({
      capabilityId,
      providerKey: capability.providerKey?.trim() || undefined,
      description: capability.description?.trim() || undefined,
      required: capability.required === true,
      available: capability.available !== false,
      limits: cleanList(capability.limits),
      evidence: cleanList(capability.evidence),
    });
  }

  if (normalized.length === 0) {
    return failure("MISSING_CAPABILITY", "output interface capability requires at least one capability signal", "input");
  }

  return normalized;
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | OutputInterfaceCapabilityResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `output interface capability scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

export function defineOutputInterfaceCapabilities(
  request?: OutputInterfaceCapabilityRequest,
): OutputInterfaceCapabilityResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "output interface capability requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const sourceInterfaceId = request.sourceInterfaceId?.trim();

  if (!sourceInterfaceId) {
    return failure("MISSING_INTERFACE_ID", "output interface capability requires sourceInterfaceId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "output interface capability was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "output interface capability was rejected by runtime governance",
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

  const requiredCapabilities = cleanList(request.requiredCapabilities);
  const required = requiredCapabilities.length > 0 ? requiredCapabilities : capabilities.filter((item) => item.required).map((item) => item.capabilityId);
  const available = new Set(capabilities.filter((item) => item.available).map((item) => item.capabilityId));
  const missingCapabilities = required.filter((capabilityId) => !available.has(capabilityId));
  const compatible = missingCapabilities.length === 0;

  return {
    ok: true,
    envelope: {
      kind: "agentCore.modelAdapter.outputInterfaceCapability",
      runtimeId,
      sourceInterfaceId,
      providerId: request.providerId?.trim() || undefined,
      modelId: request.modelId?.trim() || undefined,
      capabilities,
      requiredCapabilities: required,
      missingCapabilities,
      compatible,
      acceptedScopes,
      bridgeReadiness: compatible ? "ready" : "blocked-by-missing-capability",
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: [
      compatible
        ? "modelAdapter.outputInterfaceCapability.accepted"
        : "modelAdapter.outputInterfaceCapability.missingCapability",
    ],
  };
}
