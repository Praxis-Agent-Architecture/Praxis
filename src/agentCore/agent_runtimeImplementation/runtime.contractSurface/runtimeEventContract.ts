/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Event Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeContractBoundary, RuntimeContractError, RuntimeContractGate } from "./runtimeErrorContract.js";

export type RuntimeEventVisibility = "public" | "application" | "official-module" | "internal";

export type RuntimeEventContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTRACT_ID"
  | "MISSING_EVENT_TYPE"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "EVENT_SCOPE_DENIED";

export type RuntimeEventContractRequest = {
  runtimeId: string;
  contractId: string;
  eventType: string;
  producerSurface?: "applicationSurface" | "officialModuleSurface" | "invocationMethod" | "inspection" | "debug";
  visibility?: RuntimeEventVisibility;
  payloadShape?: readonly string[];
  allowedSubscribers?: readonly string[];
  requestedSubscriber?: string;
  runtimeReady?: boolean;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimeEventEnvelope = {
  type: string;
  runtimeId: string;
  contractId: string;
  producerSurface?: string;
  payload?: unknown;
};

export type RuntimeEventContract = {
  runtimeId: string;
  contractId: string;
  eventType: string;
  producerSurface?: string;
  visibility: RuntimeEventVisibility;
  payloadShape: readonly string[];
  allowedSubscribers: readonly string[];
  contractSurface: "runtime.contractSurface";
  unsafeSideEffects: false;
  accepts: (event: RuntimeEventEnvelope) => boolean;
};

export type RuntimeEventContractResult =
  | {
      ok: true;
      eventContract: RuntimeEventContract;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeContractError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function runtimeError(
  code: RuntimeEventContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeContractError {
  return {
    code,
    message,
    boundary,
    severity: "recoverable",
    safeForApplication: true,
    internalDetailExposed: false,
  };
}

function failure(
  code: RuntimeEventContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeEventContractResult {
  return {
    ok: false,
    error: runtimeError(code, message, boundary),
    events: ["runtime.event.contract.rejected"],
  };
}

export function defineRuntimeEventContract(request: RuntimeEventContractRequest): RuntimeEventContractResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before defining a runtime event contract", "input");
  }

  if (isBlank(request.contractId)) {
    return failure("MISSING_CONTRACT_ID", "contractId is required before defining a runtime event contract", "input");
  }

  if (isBlank(request.eventType)) {
    return failure("MISSING_EVENT_TYPE", "eventType is required before defining a runtime event contract", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime event contracts require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime event contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime event contract was rejected by governance",
      "governance",
    );
  }

  const allowedSubscribers = cleanList(request.allowedSubscribers);
  const requestedSubscriber = request.requestedSubscriber?.trim();
  if (requestedSubscriber && allowedSubscribers.length > 0 && !allowedSubscribers.includes(requestedSubscriber)) {
    return failure(
      "EVENT_SCOPE_DENIED",
      `subscriber ${requestedSubscriber} is outside the runtime event contract scope`,
      "scope",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const contractId = request.contractId.trim();
  const eventType = request.eventType.trim();

  return {
    ok: true,
    eventContract: {
      runtimeId,
      contractId,
      eventType,
      producerSurface: request.producerSurface,
      visibility: request.visibility ?? "application",
      payloadShape: cleanList(request.payloadShape),
      allowedSubscribers,
      contractSurface: "runtime.contractSurface",
      unsafeSideEffects: false,
      accepts(event: RuntimeEventEnvelope): boolean {
        return event.runtimeId === runtimeId && event.contractId === contractId && event.type === eventType;
      },
    },
    events: ["runtime.event.contract.defined"],
  };
}
