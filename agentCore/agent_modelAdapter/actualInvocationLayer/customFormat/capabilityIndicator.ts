/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：标识自定义上游格式当前的能力可用信号。
 * 能力要求1：需要承载可用、不可用、部分可用、需要鉴权、需要配置等状态。
 * 能力要求2：给 abstractionLayer 和 runtime 检查面提供判断依据。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type CustomFormatCapabilityBoundary,
  type CustomFormatCapabilityGate,
  type CustomFormatReceivedCapability,
} from "./capabilityReceiver.js";

export type CustomFormatCapabilityAvailability =
  | "available"
  | "unavailable"
  | "partial"
  | "needs-auth"
  | "needs-config";

export type CustomFormatCapabilityIndicatorRequest = {
  capability?: CustomFormatReceivedCapability;
  enabled?: boolean;
  authReady?: boolean;
  configurationReady?: boolean;
  providerReachable?: boolean;
  degradationReasons?: readonly string[];
  observedAt?: string;
  contract?: CustomFormatCapabilityGate;
  governance?: CustomFormatCapabilityGate;
};

export type CustomFormatCapabilitySignal = {
  providerId: string;
  endpointId: string;
  capabilityId: string;
  availability: CustomFormatCapabilityAvailability;
  reasons: readonly string[];
  observedAt: string;
  usableByAbstractionLayer: boolean;
  audit: {
    indicatedBy: "customFormat.capabilityIndicator";
    dryRun: true;
    unsafeSideEffects: false;
    rawProviderFieldsExposed: false;
  };
  capability: CustomFormatReceivedCapability;
};

export type CustomFormatCapabilityIndicatorErrorCode =
  | "MISSING_CAPABILITY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatCapabilityIndicatorError = {
  code: CustomFormatCapabilityIndicatorErrorCode;
  message: string;
  boundary: CustomFormatCapabilityBoundary;
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatCapabilityIndicatorResult =
  | {
      ok: true;
      signal: CustomFormatCapabilitySignal;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatCapabilityIndicatorError;
      events: readonly string[];
    };

export const customFormatCapabilityIndicatorDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.capabilityIndicator",
  purpose: "mark current availability of a received custom provider capability without probing the provider",
  dryRun: true,
  unsafeSideEffects: false,
} as const;

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned === undefined || cleaned.length === 0 ? undefined : cleaned;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: CustomFormatCapabilityIndicatorErrorCode,
  message: string,
  boundary: CustomFormatCapabilityBoundary,
): CustomFormatCapabilityIndicatorResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.capability.indicate.rejected"],
  };
}

function resolveAvailability(request: CustomFormatCapabilityIndicatorRequest): {
  availability: CustomFormatCapabilityAvailability;
  reasons: readonly string[];
} {
  const degradationReasons = cleanList(request.degradationReasons);

  if (request.enabled === false) {
    return { availability: "unavailable", reasons: ["capability disabled by provider configuration"] };
  }

  if (request.authReady === false) {
    return { availability: "needs-auth", reasons: ["provider authentication is required"] };
  }

  if (request.configurationReady === false) {
    return { availability: "needs-config", reasons: ["provider capability configuration is incomplete"] };
  }

  if (request.providerReachable === false) {
    return { availability: "unavailable", reasons: ["provider endpoint is not reachable"] };
  }

  if (degradationReasons.length > 0) {
    return { availability: "partial", reasons: degradationReasons };
  }

  return { availability: "available", reasons: [] };
}

export function indicateCustomFormatCapability(
  request?: CustomFormatCapabilityIndicatorRequest,
): CustomFormatCapabilityIndicatorResult {
  if (request?.capability === undefined) {
    return failure("MISSING_CAPABILITY", "customFormat capability indicator requires a received capability", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected the customFormat capability signal",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected the customFormat capability signal",
      "governance",
    );
  }

  const { availability, reasons } = resolveAvailability(request);
  const capability = request.capability;

  return {
    ok: true,
    signal: {
      providerId: capability.providerId,
      endpointId: capability.endpointId,
      capabilityId: capability.capabilityId,
      availability,
      reasons,
      observedAt: cleanText(request.observedAt) ?? "dry-run",
      usableByAbstractionLayer: availability === "available" || availability === "partial",
      audit: {
        indicatedBy: "customFormat.capabilityIndicator",
        dryRun: true,
        unsafeSideEffects: false,
        rawProviderFieldsExposed: false,
      },
      capability,
    },
    events: [`customFormat.capability.${availability}`],
  };
}
