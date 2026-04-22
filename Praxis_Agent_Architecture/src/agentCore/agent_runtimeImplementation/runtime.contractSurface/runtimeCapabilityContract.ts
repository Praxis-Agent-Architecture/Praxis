/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Capability Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { RuntimeContractBoundary, RuntimeContractError, RuntimeContractGate } from "./runtimeErrorContract.js";

export type RuntimeCapabilityKind = "agent" | "tool" | "model" | "interface" | "event" | "extension";

export type RuntimeCapabilityContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CONTRACT_ID"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CAPABILITY_KIND"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CAPABILITY_SCOPE_DENIED";

export type RuntimeCapabilityScope = {
  name: string;
  source: "applicationSurface" | "officialModuleSurface" | "invocationMethod" | "inspection" | "debug";
};

export type RuntimeCapabilityContractRequest = {
  runtimeId: string;
  contractId: string;
  capabilityId: string;
  kind?: RuntimeCapabilityKind;
  requestedScope?: string;
  allowedScopes?: readonly RuntimeCapabilityScope[];
  inputBoundary?: readonly string[];
  outputBoundary?: readonly string[];
  runtimeReady?: boolean;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimeCapabilityContract = {
  runtimeId: string;
  contractId: string;
  capabilityId: string;
  kind: RuntimeCapabilityKind;
  scope?: RuntimeCapabilityScope;
  inputBoundary: readonly string[];
  outputBoundary: readonly string[];
  governanceState: "accepted";
  contractSurface: "runtime.contractSurface";
  requiresRuntimeGovernance: true;
  unsafeSideEffects: false;
};

export type RuntimeCapabilityContractResult =
  | {
      ok: true;
      capability: RuntimeCapabilityContract;
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
  code: RuntimeCapabilityContractErrorCode,
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
  code: RuntimeCapabilityContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeCapabilityContractResult {
  return {
    ok: false,
    error: runtimeError(code, message, boundary),
    events: ["runtime.capability.contract.rejected"],
  };
}

function resolveScope(
  requestedScope: string | undefined,
  allowedScopes: readonly RuntimeCapabilityScope[] | undefined,
): RuntimeCapabilityScope | undefined {
  const requested = requestedScope?.trim();
  if (!requested) {
    return undefined;
  }

  return allowedScopes?.find((scope) => scope.name.trim() === requested);
}

export function defineRuntimeCapabilityContract(
  request: RuntimeCapabilityContractRequest,
): RuntimeCapabilityContractResult {
  if (isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before defining a runtime capability contract", "input");
  }

  if (isBlank(request.contractId)) {
    return failure(
      "MISSING_CONTRACT_ID",
      "contractId is required before defining a runtime capability contract",
      "input",
    );
  }

  if (isBlank(request.capabilityId)) {
    return failure(
      "MISSING_CAPABILITY_ID",
      "capabilityId is required before defining a runtime capability contract",
      "input",
    );
  }

  if (request.kind === undefined) {
    return failure(
      "MISSING_CAPABILITY_KIND",
      "capability kind must be explicit at the runtime contract surface",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime capability contracts require a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime capability contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime capability contract was rejected by governance",
      "governance",
    );
  }

  const scope = resolveScope(request.requestedScope, request.allowedScopes);
  if (request.requestedScope !== undefined && scope === undefined) {
    return failure(
      "CAPABILITY_SCOPE_DENIED",
      `capability scope ${request.requestedScope.trim()} is outside the runtime contract surface`,
      "scope",
    );
  }

  return {
    ok: true,
    capability: {
      runtimeId: request.runtimeId.trim(),
      contractId: request.contractId.trim(),
      capabilityId: request.capabilityId.trim(),
      kind: request.kind,
      scope,
      inputBoundary: cleanList(request.inputBoundary),
      outputBoundary: cleanList(request.outputBoundary),
      governanceState: "accepted",
      contractSurface: "runtime.contractSurface",
      requiresRuntimeGovernance: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.capability.contract.defined"],
  };
}
