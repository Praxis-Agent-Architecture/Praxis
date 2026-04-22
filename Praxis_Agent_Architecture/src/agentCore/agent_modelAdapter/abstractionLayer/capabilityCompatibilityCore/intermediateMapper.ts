/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 intermediate Mapper 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  NormalizedOutputInterfaceCapability,
  OutputInterfaceCapabilityEnvelope,
} from "./outputInterfaceCapability.js";
import type { NormalizedOutputInterfaceFormat, OutputInterfaceFormatEnvelope } from "./outputInterfaceFormat.js";

export type IntermediateMapperBoundary = "input" | "contract" | "governance" | "scope" | "compatibility";

export type IntermediateMapperGate = {
  accepted: boolean;
  reason?: string;
};

export type IntermediateMapperRequest = {
  runtimeId?: string;
  mappingId?: string;
  sourceInterfaceId?: string;
  capabilityEnvelope?: OutputInterfaceCapabilityEnvelope;
  formatEnvelope?: OutputInterfaceFormatEnvelope;
  targetCapabilityIds?: readonly string[];
  targetFormatIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: IntermediateMapperGate;
  governance?: IntermediateMapperGate;
};

export type IntermediateMapperErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MAPPING_ID"
  | "MISSING_INTERFACE_ID"
  | "MISSING_INTERMEDIATE_INPUT"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "SOURCE_MISMATCH";

export type IntermediateMapperError = {
  code: IntermediateMapperErrorCode;
  message: string;
  boundary: IntermediateMapperBoundary;
  safeForRuntimeInspection: true;
};

export type IntermediateCapabilityMatch = {
  capabilityId: string;
  providerKey?: string;
  available: boolean;
  required: boolean;
  status: "matched" | "missing";
  evidence: readonly string[];
  limits: readonly string[];
};

export type IntermediateFormatMatch = {
  formatId: string;
  mediaType?: string;
  providerKey?: string;
  streaming: boolean;
  structured: boolean;
  available: boolean;
  status: "matched" | "missing";
};

export type IntermediateCompatibilityGap = {
  kind: "capability" | "format";
  id: string;
  reason: "missing" | "unavailable";
};

export type IntermediateCompatibilityMapping = {
  kind: "agentCore.modelAdapter.intermediateMapping";
  runtimeId: string;
  mappingId: string;
  sourceInterfaceId: string;
  capabilityMatches: readonly IntermediateCapabilityMatch[];
  formatMatches: readonly IntermediateFormatMatch[];
  gaps: readonly IntermediateCompatibilityGap[];
  compatible: boolean;
  acceptedScopes: readonly string[];
  bridgeHandoff: {
    bridgingLayer: "pending";
    providerPayloadCreated: false;
  };
  unsafeSideEffects: false;
};

export type IntermediateMapperResult =
  | {
      ok: true;
      mapping: IntermediateCompatibilityMapping;
      events: readonly string[];
    }
  | {
      ok: false;
      error: IntermediateMapperError;
      events: readonly string[];
    };

export const intermediateMapperDescriptor = {
  capability: "intermediate-mapper",
  route: "agent_modelAdapter.abstractionLayer.capabilityCompatibilityCore",
  purpose: "map normalized output capabilities and formats into provider-neutral intermediate compatibility records",
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
  code: IntermediateMapperErrorCode,
  message: string,
  boundary: IntermediateMapperBoundary,
): IntermediateMapperResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.intermediateMapper.rejected"],
  };
}

function resolveScopes(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): readonly string[] | IntermediateMapperResult {
  const requested = cleanList(requestedScopes);
  const allowed = cleanList(allowedScopes);

  if (requested.length === 0) {
    return [];
  }

  const denied = requested.filter((scope) => !allowed.includes(scope));
  if (denied.length > 0) {
    return failure("SCOPE_DENIED", `intermediate mapper scope ${denied[0]} is outside runtime governance`, "scope");
  }

  return requested;
}

function targetCapabilityIds(
  explicitTargets: readonly string[] | undefined,
  capabilities: readonly NormalizedOutputInterfaceCapability[],
): readonly string[] {
  const explicit = cleanList(explicitTargets);
  if (explicit.length > 0) {
    return explicit;
  }

  const required = capabilities.filter((capability) => capability.required).map((capability) => capability.capabilityId);
  return required.length > 0 ? required : capabilities.map((capability) => capability.capabilityId);
}

function targetFormatIds(
  explicitTargets: readonly string[] | undefined,
  formats: readonly NormalizedOutputInterfaceFormat[],
): readonly string[] {
  const explicit = cleanList(explicitTargets);
  return explicit.length > 0 ? explicit : formats.map((format) => format.formatId);
}

function mapCapabilities(
  targets: readonly string[],
  capabilities: readonly NormalizedOutputInterfaceCapability[],
): {
  matches: IntermediateCapabilityMatch[];
  gaps: IntermediateCompatibilityGap[];
} {
  const byId = new Map(capabilities.map((capability) => [capability.capabilityId, capability]));
  const matches: IntermediateCapabilityMatch[] = [];
  const gaps: IntermediateCompatibilityGap[] = [];

  for (const capabilityId of targets) {
    const capability = byId.get(capabilityId);
    if (capability === undefined) {
      gaps.push({ kind: "capability", id: capabilityId, reason: "missing" });
      matches.push({
        capabilityId,
        available: false,
        required: true,
        status: "missing",
        evidence: [],
        limits: [],
      });
      continue;
    }

    if (!capability.available) {
      gaps.push({ kind: "capability", id: capabilityId, reason: "unavailable" });
    }

    matches.push({
      capabilityId,
      providerKey: capability.providerKey,
      available: capability.available,
      required: true,
      status: capability.available ? "matched" : "missing",
      evidence: capability.evidence,
      limits: capability.limits,
    });
  }

  return { matches, gaps };
}

function mapFormats(
  targets: readonly string[],
  formats: readonly NormalizedOutputInterfaceFormat[],
): {
  matches: IntermediateFormatMatch[];
  gaps: IntermediateCompatibilityGap[];
} {
  const byId = new Map(formats.map((format) => [format.formatId, format]));
  const matches: IntermediateFormatMatch[] = [];
  const gaps: IntermediateCompatibilityGap[] = [];

  for (const formatId of targets) {
    const format = byId.get(formatId);
    if (format === undefined) {
      gaps.push({ kind: "format", id: formatId, reason: "missing" });
      matches.push({
        formatId,
        streaming: false,
        structured: false,
        available: false,
        status: "missing",
      });
      continue;
    }

    if (!format.available) {
      gaps.push({ kind: "format", id: formatId, reason: "unavailable" });
    }

    matches.push({
      formatId,
      mediaType: format.mediaType,
      providerKey: format.providerKey,
      streaming: format.streaming,
      structured: format.structured,
      available: format.available,
      status: format.available ? "matched" : "missing",
    });
  }

  return { matches, gaps };
}

function assertEnvelopeSource(
  runtimeId: string,
  sourceInterfaceId: string,
  capabilityEnvelope: OutputInterfaceCapabilityEnvelope | undefined,
  formatEnvelope: OutputInterfaceFormatEnvelope | undefined,
): IntermediateMapperResult | undefined {
  for (const envelope of [capabilityEnvelope, formatEnvelope]) {
    if (envelope === undefined) {
      continue;
    }

    if (envelope.runtimeId !== runtimeId || envelope.sourceInterfaceId !== sourceInterfaceId) {
      return failure(
        "SOURCE_MISMATCH",
        "intermediate mapper envelopes must belong to the same runtimeId and sourceInterfaceId",
        "contract",
      );
    }
  }

  return undefined;
}

export function mapIntermediateCapabilityCompatibility(request?: IntermediateMapperRequest): IntermediateMapperResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "intermediate mapper requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const mappingId = request.mappingId?.trim();
  const sourceInterfaceId = request.sourceInterfaceId?.trim();

  if (!mappingId) {
    return failure("MISSING_MAPPING_ID", "intermediate mapper requires mappingId", "input");
  }

  if (!sourceInterfaceId) {
    return failure("MISSING_INTERFACE_ID", "intermediate mapper requires sourceInterfaceId", "input");
  }

  if (request.capabilityEnvelope === undefined && request.formatEnvelope === undefined) {
    return failure("MISSING_INTERMEDIATE_INPUT", "intermediate mapper requires capability or format envelopes", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "intermediate mapping was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "intermediate mapping was rejected by runtime governance",
      "governance",
    );
  }

  const sourceFailure = assertEnvelopeSource(runtimeId, sourceInterfaceId, request.capabilityEnvelope, request.formatEnvelope);
  if (sourceFailure !== undefined) {
    return sourceFailure;
  }

  const acceptedScopes = resolveScopes(request.requestedScopes, request.allowedScopes);
  if ("ok" in acceptedScopes) {
    return acceptedScopes;
  }

  const capabilityTargets = targetCapabilityIds(
    request.targetCapabilityIds,
    request.capabilityEnvelope?.capabilities ?? [],
  );
  const formatTargets = targetFormatIds(request.targetFormatIds, request.formatEnvelope?.formats ?? []);
  const capabilityMapping = mapCapabilities(capabilityTargets, request.capabilityEnvelope?.capabilities ?? []);
  const formatMapping = mapFormats(formatTargets, request.formatEnvelope?.formats ?? []);
  const gaps = [...capabilityMapping.gaps, ...formatMapping.gaps];

  return {
    ok: true,
    mapping: {
      kind: "agentCore.modelAdapter.intermediateMapping",
      runtimeId,
      mappingId,
      sourceInterfaceId,
      capabilityMatches: capabilityMapping.matches,
      formatMatches: formatMapping.matches,
      gaps,
      compatible: gaps.length === 0,
      acceptedScopes,
      bridgeHandoff: {
        bridgingLayer: "pending",
        providerPayloadCreated: false,
      },
      unsafeSideEffects: false,
    },
    events: [gaps.length === 0 ? "modelAdapter.intermediateMapper.accepted" : "modelAdapter.intermediateMapper.gapped"],
  };
}
