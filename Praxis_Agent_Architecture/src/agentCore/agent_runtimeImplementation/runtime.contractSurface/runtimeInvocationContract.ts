/*
 * 文件定位：Agent 运行态实现层 / 运行契约面。
 * 核心目的：承载 runtime Invocation Contract 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  RuntimeContractBoundary,
  RuntimeContractCaller,
  RuntimeContractGate,
} from "./runtimePublicContract.js";

export type RuntimeInvocationTarget = "agent" | "tool" | "model" | "interface" | "stream" | "batch";

export type RuntimeInvocationContractErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_TARGET"
  | "UNSUPPORTED_TARGET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type RuntimeInvocationContractError = {
  code: RuntimeInvocationContractErrorCode;
  message: string;
  boundary: RuntimeContractBoundary;
  invocationSafe: true;
};

export type RuntimeInvocationContractRequest = {
  runtimeId?: string;
  caller?: RuntimeContractCaller;
  target?: RuntimeInvocationTarget | string;
  invocationId?: string;
  runtimeReady?: boolean;
  requestedCapabilities?: readonly string[];
  payload?: unknown;
  contract?: RuntimeContractGate;
  governance?: RuntimeContractGate;
};

export type RuntimeInvocationEnvelope = {
  runtimeId: string;
  invocationId: string;
  caller: RuntimeContractCaller;
  target: RuntimeInvocationTarget;
  route: "runtime.invocationMethod";
  requestedCapabilities: readonly string[];
  dryRun: true;
  unsafeSideEffects: false;
};

export type RuntimeInvocationContractResult =
  | {
      ok: true;
      invocation: RuntimeInvocationEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RuntimeInvocationContractError;
      events: readonly string[];
    };

const supportedTargets = ["agent", "tool", "model", "interface", "stream", "batch"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function isRuntimeInvocationTarget(value: string): value is RuntimeInvocationTarget {
  return supportedTargets.includes(value as RuntimeInvocationTarget);
}

function failure(
  code: RuntimeInvocationContractErrorCode,
  message: string,
  boundary: RuntimeContractBoundary,
): RuntimeInvocationContractResult {
  return {
    ok: false,
    error: { code, message, boundary, invocationSafe: true },
    events: ["runtime.invocationContract.rejected"],
  };
}

export function defineRuntimeInvocationContract(
  request?: RuntimeInvocationContractRequest,
): RuntimeInvocationContractResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtime invocation contract requires a runtimeId", "input");
  }

  if (request.caller === undefined || isBlank(request.caller.id)) {
    return failure("MISSING_CALLER", "runtime invocation contract requires an application or module caller", "input");
  }

  if (isBlank(request.target)) {
    return failure("MISSING_TARGET", "runtime invocation contract requires an invocation target", "input");
  }

  const target = (request.target ?? "").trim();
  if (!isRuntimeInvocationTarget(target)) {
    return failure("UNSUPPORTED_TARGET", `runtime invocation target ${target} is not part of this contract`, "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "invocation contract can only route through a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime invocation contract was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime invocation contract was rejected by governance",
      "governance",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const callerId = request.caller.id.trim();

  return {
    ok: true,
    invocation: {
      runtimeId,
      invocationId: request.invocationId?.trim() || `${runtimeId}:${target}:${callerId}`,
      caller: {
        kind: request.caller.kind,
        id: callerId,
      },
      target,
      route: "runtime.invocationMethod",
      requestedCapabilities: cleanList(request.requestedCapabilities),
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.invocationContract.accepted"],
  };
}
