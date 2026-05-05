/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 intermediate Transformer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  IntermediateCapabilityMatch,
  IntermediateCompatibilityGap,
  IntermediateCompatibilityMapping,
  IntermediateFormatMatch,
} from "./intermediateMapper.js";

export type IntermediateTransformerBoundary = "input" | "contract" | "governance" | "scope" | "compatibility";

export type IntermediateTransformerGate = {
  accepted: boolean;
  reason?: string;
};

export type IntermediateTransformerRequest = {
  runtimeId?: string;
  transformationId?: string;
  mapping?: IntermediateCompatibilityMapping;
  requireCompatibility?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: IntermediateTransformerGate;
  governance?: IntermediateTransformerGate;
};

export type IntermediateTransformerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TRANSFORMATION_ID"
  | "MISSING_MAPPING"
  | "RUNTIME_MISMATCH"
  | "INCOMPATIBLE_MAPPING"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type IntermediateTransformerError = {
  code: IntermediateTransformerErrorCode;
  message: string;
  boundary: IntermediateTransformerBoundary;
  safeForRuntimeInspection: true;
};

export type BridgeReadyCapability = {
  capabilityId: string;
  providerKey?: string;
  available: boolean;
  required: boolean;
  evidence: readonly string[];
  limits: readonly string[];
};

export type BridgeReadyFormat = {
  formatId: string;
  mediaType?: string;
  providerKey?: string;
  streaming: boolean;
  structured: boolean;
  available: boolean;
};

export type IntermediateTransformationEnvelope = {
  kind: "agentCore.modelAdapter.intermediateTransformation";
  runtimeId: string;
  transformationId: string;
  mappingId: string;
  sourceInterfaceId: string;
  capabilities: readonly BridgeReadyCapability[];
  formats: readonly BridgeReadyFormat[];
  gaps: readonly IntermediateCompatibilityGap[];
  compatible: boolean;
  acceptedScopes: readonly string[];
  bridgeReadiness: "ready" | "blocked-by-compatibility-gap";
  bridgeHandoff: {
    bridgingLayer: "pending";
    providerPayloadCreated: false;
  };
  unsafeSideEffects: false;
};

export type IntermediateTransformerResult =
  | {
      ok: true;
      envelope: IntermediateTransformationEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: IntermediateTransformerError;
      events: readonly string[];
    };

export const intermediateTransformerDescriptor = {
  capability: "intermediate-transformer",
  route: "agent_modelAdapter.abstractionLayer.capabilityCompatibilityCore",
  purpose: "transform intermediate compatibility mappings into a bridge-ready provider-neutral envelope",
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
  code: IntermediateTransformerErrorCode,
  message: string,
  boundary: IntermediateTransformerBoundary,
): IntermediateTransformerResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.intermediateTransformer.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | IntermediateTransformerResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `intermediate transformer scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function toBridgeCapability(match: IntermediateCapabilityMatch): BridgeReadyCapability {
  return {
    capabilityId: match.capabilityId,
    providerKey: match.providerKey,
    available: match.available,
    required: match.required,
    evidence: match.evidence,
    limits: match.limits,
  };
}

function toBridgeFormat(match: IntermediateFormatMatch): BridgeReadyFormat {
  return {
    formatId: match.formatId,
    mediaType: match.mediaType,
    providerKey: match.providerKey,
    streaming: match.streaming,
    structured: match.structured,
    available: match.available,
  };
}

export function transformIntermediateCompatibility(
  request?: IntermediateTransformerRequest,
): IntermediateTransformerResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "intermediate transformer requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const transformationId = request.transformationId?.trim();

  if (!transformationId) {
    return failure("MISSING_TRANSFORMATION_ID", "intermediate transformer requires transformationId", "input");
  }

  if (request.mapping === undefined) {
    return failure("MISSING_MAPPING", "intermediate transformer requires an intermediate mapping", "input");
  }

  if (request.mapping.runtimeId !== runtimeId) {
    return failure("RUNTIME_MISMATCH", "intermediate transformer mapping belongs to a different runtime", "contract");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "intermediate transformation was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "intermediate transformation was rejected by runtime governance",
      "governance",
    );
  }

  if (request.requireCompatibility === true && !request.mapping.compatible) {
    return failure(
      "INCOMPATIBLE_MAPPING",
      "intermediate transformer cannot require compatibility while mapping contains gaps",
      "compatibility",
    );
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const compatible = request.mapping.compatible;

  return {
    ok: true,
    envelope: {
      kind: "agentCore.modelAdapter.intermediateTransformation",
      runtimeId,
      transformationId,
      mappingId: request.mapping.mappingId,
      sourceInterfaceId: request.mapping.sourceInterfaceId,
      capabilities: request.mapping.capabilityMatches.map(toBridgeCapability),
      formats: request.mapping.formatMatches.map(toBridgeFormat),
      gaps: request.mapping.gaps,
      compatible,
      acceptedScopes,
      bridgeReadiness: compatible ? "ready" : "blocked-by-compatibility-gap",
      bridgeHandoff: {
        bridgingLayer: "pending",
        providerPayloadCreated: false,
      },
      unsafeSideEffects: false,
    },
    events: [
      compatible
        ? "modelAdapter.intermediateTransformer.accepted"
        : "modelAdapter.intermediateTransformer.compatibilityGap",
    ],
  };
}
