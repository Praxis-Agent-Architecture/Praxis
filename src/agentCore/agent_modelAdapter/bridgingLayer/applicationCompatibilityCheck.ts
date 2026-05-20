/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：检查抽象层整理出的模型能力是否能被 agentCore 内部调用形态真正使用。
 * 能力要求1：需要校验能力、输入格式、输出格式、上下文承载和调用约束是否满足 agentCore 需要。
 * 能力要求2：它不是检查 provider 官方 API 是否存在，而是检查“进入 agentCore 前最后一公里”是否兼容。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type ApplicationCompatibilityBoundary = "input" | "contract" | "governance" | "scope" | "compatibility";

export type ApplicationCompatibilityGate = {
  accepted: boolean;
  reason?: string;
};

export type ApplicationBridgeCapability = {
  capabilityId: string;
  providerKey?: string;
  available: boolean;
  required?: boolean;
  evidence?: readonly string[];
  limits?: readonly string[];
};

export type ApplicationBridgeFormat = {
  formatId: string;
  mediaType?: string;
  providerKey?: string;
  streaming?: boolean;
  structured?: boolean;
  available: boolean;
};

export type ApplicationBridgeGap = {
  kind: "capability" | "format";
  id: string;
  reason: string;
};

export type ApplicationBridgeCandidate = {
  kind?: string;
  runtimeId: string;
  bridgeId?: string;
  transformationId?: string;
  sourceInterfaceId?: string;
  capabilities: readonly ApplicationBridgeCapability[];
  formats: readonly ApplicationBridgeFormat[];
  gaps?: readonly ApplicationBridgeGap[];
  acceptedScopes?: readonly string[];
  compatible?: boolean;
  bridgeReadiness?: "ready" | "blocked-by-compatibility-gap" | "not-ready";
  providerPayloadCreated?: false;
  unsafeSideEffects?: boolean;
};

export type ApplicationCompatibilityRequest = {
  runtimeId?: string;
  checkId?: string;
  candidate?: ApplicationBridgeCandidate;
  requiredCapabilityIds?: readonly string[];
  requiredFormatIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  requireReadyBridge?: boolean;
  contract?: ApplicationCompatibilityGate;
  governance?: ApplicationCompatibilityGate;
};

export type ApplicationCompatibilityErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CHECK_ID"
  | "MISSING_BRIDGE_CANDIDATE"
  | "RUNTIME_MISMATCH"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "BRIDGE_NOT_READY"
  | "UNSAFE_SIDE_EFFECT";

export type ApplicationCompatibilityError = {
  code: ApplicationCompatibilityErrorCode;
  message: string;
  boundary: ApplicationCompatibilityBoundary;
  safeForRuntimeInspection: true;
};

export type ApplicationCompatibilityReport = {
  kind: "agentCore.modelAdapter.applicationCompatibility";
  runtimeId: string;
  checkId: string;
  candidateId: string;
  compatible: boolean;
  agentCoreUsable: boolean;
  missingCapabilities: readonly string[];
  missingFormats: readonly string[];
  gaps: readonly ApplicationBridgeGap[];
  acceptedScopes: readonly string[];
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type ApplicationCompatibilityResult =
  | {
      ok: true;
      report: ApplicationCompatibilityReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationCompatibilityError;
      events: readonly string[];
    };

export const applicationCompatibilityCheckDescriptor = {
  capability: "application-compatibility-check",
  route: "agent_modelAdapter.bridgingLayer",
  purpose: "check whether an abstraction-layer bridge candidate can be used by agentCore's internal model call shape",
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
  code: ApplicationCompatibilityErrorCode,
  message: string,
  boundary: ApplicationCompatibilityBoundary,
): ApplicationCompatibilityResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.applicationCompatibility.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | ApplicationCompatibilityResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `application compatibility scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function candidateId(candidate: ApplicationBridgeCandidate): string {
  return candidate.bridgeId?.trim() || candidate.transformationId?.trim() || candidate.sourceInterfaceId?.trim() || "anonymous";
}

function defaultCapabilityTargets(candidate: ApplicationBridgeCandidate): readonly string[] {
  return candidate.capabilities
    .filter((capability) => capability.required === true)
    .map((capability) => capability.capabilityId);
}

function missingCapabilities(
  requiredCapabilityIds: readonly string[] | undefined,
  capabilities: readonly ApplicationBridgeCapability[],
): readonly string[] {
  const targets = cleanList(requiredCapabilityIds);
  const required = targets.length > 0 ? targets : cleanList(capabilities.filter((item) => item.required).map((item) => item.capabilityId));
  const byId = new Map(capabilities.map((capability) => [capability.capabilityId, capability]));
  return required.filter((capabilityId) => byId.get(capabilityId)?.available !== true);
}

function missingFormats(
  requiredFormatIds: readonly string[] | undefined,
  formats: readonly ApplicationBridgeFormat[],
): readonly string[] {
  const required = cleanList(requiredFormatIds);
  const byId = new Map(formats.map((format) => [format.formatId, format]));
  return required.filter((formatId) => byId.get(formatId)?.available !== true);
}

export function checkApplicationModelCompatibility(
  request?: ApplicationCompatibilityRequest,
): ApplicationCompatibilityResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "application compatibility check requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const checkId = request.checkId?.trim();

  if (!checkId) {
    return failure("MISSING_CHECK_ID", "application compatibility check requires checkId", "input");
  }

  if (request.candidate === undefined) {
    return failure(
      "MISSING_BRIDGE_CANDIDATE",
      "application compatibility check requires an abstraction-layer bridge candidate",
      "input",
    );
  }

  if (request.candidate.runtimeId !== runtimeId) {
    return failure("RUNTIME_MISMATCH", "application compatibility candidate belongs to a different runtime", "contract");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "application compatibility was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application compatibility was rejected by runtime governance",
      "governance",
    );
  }

  if (request.candidate.unsafeSideEffects === true) {
    return failure("UNSAFE_SIDE_EFFECT", "application compatibility candidate must not carry unsafe side effects", "contract");
  }

  const bridgeReady = request.candidate.bridgeReadiness === undefined || request.candidate.bridgeReadiness === "ready";
  if (request.requireReadyBridge === true && !bridgeReady) {
    return failure("BRIDGE_NOT_READY", "application compatibility requires a ready bridge candidate", "compatibility");
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const capabilityTargets = cleanList(request.requiredCapabilityIds);
  const capabilityIds = capabilityTargets.length > 0 ? capabilityTargets : defaultCapabilityTargets(request.candidate);
  const capabilityGaps = missingCapabilities(capabilityIds, request.candidate.capabilities);
  const formatGaps = missingFormats(request.requiredFormatIds, request.candidate.formats);
  const existingGaps = request.candidate.gaps ?? [];
  const compatible =
    bridgeReady &&
    request.candidate.compatible !== false &&
    capabilityGaps.length === 0 &&
    formatGaps.length === 0 &&
    existingGaps.length === 0;

  return {
    ok: true,
    report: {
      kind: "agentCore.modelAdapter.applicationCompatibility",
      runtimeId,
      checkId,
      candidateId: candidateId(request.candidate),
      compatible,
      agentCoreUsable: compatible,
      missingCapabilities: capabilityGaps,
      missingFormats: formatGaps,
      gaps: existingGaps,
      acceptedScopes,
      providerPayloadCreated: false,
      unsafeSideEffects: false,
    },
    events: [
      compatible
        ? "modelAdapter.applicationCompatibility.compatible"
        : "modelAdapter.applicationCompatibility.gapDetected",
    ],
  };
}
