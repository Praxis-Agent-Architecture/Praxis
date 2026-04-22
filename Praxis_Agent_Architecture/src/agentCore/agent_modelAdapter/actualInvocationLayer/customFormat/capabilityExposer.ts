/*
 * 文件定位：Agent 模型适配层 / 真实上游调用层 / 非官方/自定义上游格式。
 * 核心目的：把自定义上游格式中已经确认可用的能力暴露给模型适配层。
 * 能力要求1：需要暴露的是经过整理后的能力，不是原始厂商或私有协议字段。
 * 能力要求2：用于让 customFormat 和官方 provider 一样进入统一能力选择流程。
 * 边界：只处理上游实际调用面，不在这里定义 agentCore 使用 AI 的统一方式。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  type CustomFormatCapabilityAvailability,
  type CustomFormatCapabilitySignal,
} from "./capabilityIndicator.js";
import {
  type CustomFormatCapabilityBoundary,
  type CustomFormatCapabilityFeatureFlags,
  type CustomFormatCapabilityGate,
} from "./capabilityReceiver.js";

export type CustomFormatCapabilityExposureRequest = {
  providerId?: string;
  signals?: readonly CustomFormatCapabilitySignal[];
  allowedCapabilityIds?: readonly string[];
  contract?: CustomFormatCapabilityGate;
  governance?: CustomFormatCapabilityGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomFormatExposedCapability = {
  providerId: string;
  endpointId: string;
  capabilityId: string;
  label: string;
  availability: Extract<CustomFormatCapabilityAvailability, "available" | "partial">;
  inputChannels: readonly string[];
  outputChannels: readonly string[];
  featureFlags: CustomFormatCapabilityFeatureFlags;
  exposedTo: "agent_modelAdapter";
  next: "agent_modelAdapter.abstractionLayer";
  rawProviderFieldsExposed: false;
};

export type CustomFormatWithheldCapability = {
  capabilityId: string;
  availability: CustomFormatCapabilityAvailability;
  reasons: readonly string[];
};

export type CustomFormatCapabilityExposure = {
  providerId: string;
  exposed: readonly CustomFormatExposedCapability[];
  withheld: readonly CustomFormatWithheldCapability[];
  metadata: Readonly<Record<string, unknown>>;
  audit: {
    exposedBy: "customFormat.capabilityExposer";
    dryRun: true;
    unsafeSideEffects: false;
    customFormatPromotedToPraxisStandard: false;
  };
};

export type CustomFormatCapabilityExposureErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_SIGNALS"
  | "PROVIDER_MISMATCH"
  | "SCOPE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomFormatCapabilityExposureError = {
  code: CustomFormatCapabilityExposureErrorCode;
  message: string;
  boundary: CustomFormatCapabilityBoundary | "scope";
  safeForRuntimeInspection: true;
  rawProviderFieldsExposed: false;
};

export type CustomFormatCapabilityExposureResult =
  | {
      ok: true;
      exposure: CustomFormatCapabilityExposure;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomFormatCapabilityExposureError;
      events: readonly string[];
    };

type ExposableCustomFormatCapabilitySignal = CustomFormatCapabilitySignal & {
  availability: Extract<CustomFormatCapabilityAvailability, "available" | "partial">;
};

export const customFormatCapabilityExposerDescriptor = {
  layer: "agent_modelAdapter.actualInvocationLayer.customFormat",
  capability: "customFormat.capabilityExposer",
  purpose: "expose confirmed custom provider capabilities to the model adapter without leaking raw provider fields",
  dryRun: true,
  unsafeSideEffects: false,
  exposedTo: "agent_modelAdapter",
} as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

function failure(
  code: CustomFormatCapabilityExposureErrorCode,
  message: string,
  boundary: CustomFormatCapabilityExposureError["boundary"],
): CustomFormatCapabilityExposureResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, rawProviderFieldsExposed: false },
    events: ["customFormat.capability.expose.rejected"],
  };
}

function canExpose(signal: CustomFormatCapabilitySignal): signal is ExposableCustomFormatCapabilitySignal {
  return (
    signal.usableByAbstractionLayer &&
    (signal.availability === "available" || signal.availability === "partial")
  );
}

export function exposeCustomFormatCapabilities(
  request?: CustomFormatCapabilityExposureRequest,
): CustomFormatCapabilityExposureResult {
  const providerId = request?.providerId?.trim();

  if (request === undefined || providerId === undefined || providerId.length === 0) {
    return failure("MISSING_PROVIDER_ID", "customFormat capability exposer requires providerId", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime contract surface rejected customFormat capability exposure",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime governance rejected customFormat capability exposure",
      "governance",
    );
  }

  if (request.signals === undefined || request.signals.length === 0) {
    return failure("MISSING_SIGNALS", "customFormat capability exposer requires at least one capability signal", "input");
  }

  const mismatched = request.signals.find((signal) => signal.providerId !== providerId);
  if (mismatched !== undefined) {
    return failure(
      "PROVIDER_MISMATCH",
      `customFormat capability signal ${mismatched.capabilityId} belongs to another provider`,
      "input",
    );
  }

  const allowedCapabilityIds = cleanList(request.allowedCapabilityIds);
  const usableSignals = request.signals.filter(canExpose);
  const denied = usableSignals.find(
    (signal) => allowedCapabilityIds.length > 0 && !allowedCapabilityIds.includes(signal.capabilityId),
  );
  if (denied !== undefined) {
    return failure(
      "SCOPE_DENIED",
      `customFormat capability ${denied.capabilityId} is outside the allowed exposure scope`,
      "scope",
    );
  }

  const exposedCapabilityIds = new Set(usableSignals.map((signal) => signal.capabilityId));

  return {
    ok: true,
    exposure: {
      providerId,
      exposed: usableSignals.map((signal) => ({
        providerId: signal.providerId,
        endpointId: signal.endpointId,
        capabilityId: signal.capabilityId,
        label: signal.capability.label,
        availability: signal.availability,
        inputChannels: signal.capability.inputChannels,
        outputChannels: signal.capability.outputChannels,
        featureFlags: signal.capability.featureFlags,
        exposedTo: "agent_modelAdapter",
        next: "agent_modelAdapter.abstractionLayer",
        rawProviderFieldsExposed: false,
      })),
      withheld: request.signals
        .filter((signal) => !exposedCapabilityIds.has(signal.capabilityId))
        .map((signal) => ({
          capabilityId: signal.capabilityId,
          availability: signal.availability,
          reasons: signal.reasons,
        })),
      metadata: request.metadata ?? {},
      audit: {
        exposedBy: "customFormat.capabilityExposer",
        dryRun: true,
        unsafeSideEffects: false,
        customFormatPromotedToPraxisStandard: false,
      },
    },
    events: ["customFormat.capability.exposed"],
  };
}
