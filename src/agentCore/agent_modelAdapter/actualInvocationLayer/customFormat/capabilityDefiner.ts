/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：为自定义上游格式定义它声称具备的模型能力。
 * 能力要求1：需要描述这个自定义 provider 支持哪些输入、输出、工具、流式、文件或上下文能力。
 * 能力要求2：这些能力会被 abstractionLayer 继续整理，而不是直接绕过统一抽象。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type CustomFormatCapabilityBoundary,
  type CustomFormatCapabilityClaimInput,
  type CustomFormatCapabilityGate,
  type CustomFormatCapabilityTrace,
  type CustomFormatReceivedCapability,
  receiveCustomFormatCapability,
} from "./capabilityReceiver.js";

export type CustomFormatCapabilityDefinitionClaim = CustomFormatCapabilityClaimInput;

export type CustomFormatCapabilityDefinitionRequest = {
  providerId?: string;
  endpointId?: string;
  claims?: readonly CustomFormatCapabilityDefinitionClaim[];
  trace?: CustomFormatCapabilityTrace;
  contract?: CustomFormatCapabilityGate;
  governance?: CustomFormatCapabilityGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomFormatCapabilityDefinition = {
  providerId: string;
  endpointId: string;
  capabilities: readonly CustomFormatReceivedCapability[];
  capabilityIds: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  trace: CustomFormatCapabilityTrace;
  abstractionHandoff: {
    target: "agent_modelAdapter.abstractionLayer";
    rawProviderFieldsExposed: false;
    customFormatPromotedToPraxisStandard: false;
  };
  audit: {
    definedBy: "customFormat.capabilityDefiner";
    dryRun: true;
    unsafeSideEffects: false;
  };
};

export type CustomFormatCapabilityDefinitionErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_ENDPOINT_ID"
  | "MISSING_CLAIMS"
  | "CLAIM_REJECTED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatCapabilityDefinitionError = {
  code: CustomFormatCapabilityDefinitionErrorCode;
  message: string;
  boundary: CustomFormatCapabilityBoundary;
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatCapabilityDefinitionResult =
  | {
      ok: true;
      definition: CustomFormatCapabilityDefinition;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatCapabilityDefinitionError;
      events: readonly string[];
    };

export const customFormatCapabilityDefinerDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.capabilityDefiner",
  purpose: "define claimed custom provider capabilities for later abstraction without live provider calls",
  dryRun: true,
  unsafeSideEffects: false,
  handoff: "agent_modelAdapter.abstractionLayer",
} as const;

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function failure(
  code: CustomFormatCapabilityDefinitionErrorCode,
  message: string,
  boundary: CustomFormatCapabilityBoundary,
): CustomFormatCapabilityDefinitionResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.capability.define.rejected"],
  };
}

export function defineCustomFormatCapabilities(
  request?: CustomFormatCapabilityDefinitionRequest,
): CustomFormatCapabilityDefinitionResult {
  const providerId = request?.providerId?.trim();
  const endpointId = request?.endpointId?.trim();

  if (request === undefined || providerId === undefined || providerId.length === 0) {
    return failure("MISSING_PROVIDER_ID", "customFormat capability definer requires providerId", "input");
  }

  if (endpointId === undefined || endpointId.length === 0) {
    return failure("MISSING_ENDPOINT_ID", "customFormat capability definer requires endpointId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the customFormat capability definition",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the customFormat capability definition",
      "governance",
    );
  }

  if (request.claims === undefined || request.claims.length === 0) {
    return failure("MISSING_CLAIMS", "customFormat capability definer requires at least one capability claim", "input");
  }

  const capabilities: CustomFormatReceivedCapability[] = [];

  for (const claim of request.claims) {
    const received = receiveCustomFormatCapability({
      ...claim,
      providerId: cleanText(claim.providerId) ?? providerId,
      endpointId: cleanText(claim.endpointId) ?? endpointId,
      contract: claim.contract ?? request.contract,
      governance: claim.governance ?? request.governance,
      trace: claim.trace ?? request.trace,
    });

    if (!received.ok) {
      return failure(
        "CLAIM_REJECTED",
        `customFormat capability claim was rejected: ${received.error.message}`,
        received.error.boundary,
      );
    }

    capabilities.push(received.capability);
  }

  const capabilityIds = [...new Set(capabilities.map((capability) => capability.capabilityId))].sort();

  return {
    ok: true,
    definition: {
      providerId,
      endpointId,
      capabilities,
      capabilityIds,
      metadata: request.metadata ?? {},
      trace: {
        correlationId: cleanText(request.trace?.correlationId),
        callerId: cleanText(request.trace?.callerId),
        source: cleanText(request.trace?.source),
      },
      abstractionHandoff: {
        target: "agent_modelAdapter.abstractionLayer",
        rawProviderFieldsExposed: false,
        customFormatPromotedToPraxisStandard: false,
      },
      audit: {
        definedBy: "customFormat.capabilityDefiner",
        dryRun: true,
        unsafeSideEffects: false,
      },
    },
    events: ["customFormat.capability.defined"],
  };
}
