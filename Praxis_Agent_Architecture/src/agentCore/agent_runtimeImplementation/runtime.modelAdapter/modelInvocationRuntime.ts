/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 model Invocation Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ModelAdapterRuntimeCaller,
  ModelAdapterRuntimeGate,
} from "./modelAdapterRuntime.js";

export type ModelInvocationRuntimeMode = "single" | "stream" | "batch" | (string & {});

export type ModelInvocationRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "prompt"
  | "capability"
  | "carrier"
  | "side-effect";

export type ModelInvocationRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_LOWERED_PROMPT"
  | "MISSING_LOWERING_ID"
  | "MISSING_CAPABILITY"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CARRIER"
  | "MISSING_CARRIER_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSAFE_INVOCATION_DISABLED";

export type ModelInvocationRuntimeError = {
  code: ModelInvocationRuntimeErrorCode;
  message: string;
  boundary: ModelInvocationRuntimeBoundary;
  publicSafe: true;
};

export type ModelInvocationPromptRef = {
  loweringId?: string;
  promptPackId?: string;
  materialRefs?: readonly string[];
};

export type ModelInvocationCapabilityRef = {
  capabilityId?: string;
  kind?: string;
};

export type ModelInvocationCarrierRef = {
  carrierId?: string;
  provider?: string;
};

export type ModelInvocationRuntimeRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  invocationId?: string;
  loweredPrompt?: ModelInvocationPromptRef;
  capability?: ModelInvocationCapabilityRef;
  carrier?: ModelInvocationCarrierRef;
  mode?: ModelInvocationRuntimeMode;
  runtimeReady?: boolean;
  allowProviderCall?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelInvocationMockableEnvelope = {
  loweringId: string;
  promptPackId?: string;
  materialRefs: readonly string[];
  capabilityId: string;
  capabilityKind?: string;
  carrierId: string;
  provider?: string;
  mode: ModelInvocationRuntimeMode;
};

export type ModelInvocationPlan = {
  invocationId: string;
  runtimeId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter.modelInvocationRuntime";
  envelope: ModelInvocationMockableEnvelope;
  providerCallPermitted: false;
  transport: "mockable-envelope";
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ModelInvocationRuntimeResult =
  | {
      ok: true;
      plan: ModelInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelInvocationRuntimeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: ModelAdapterRuntimeCaller): ModelAdapterRuntimeCaller {
  const normalized: ModelAdapterRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: ModelInvocationRuntimeErrorCode,
  message: string,
  boundary: ModelInvocationRuntimeBoundary,
): ModelInvocationRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.modelInvocationRuntime.rejected"],
  };
}

export function planModelInvocation(
  request?: ModelInvocationRuntimeRequest,
): ModelInvocationRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "model invocation runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "model invocation runtime requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "model invocation can only be planned through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "model invocation runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "model invocation runtime was rejected by governance",
      "governance",
    );
  }

  if (request.allowProviderCall === true) {
    return failure(
      "UNSAFE_INVOCATION_DISABLED",
      "model invocation runtime first pass only builds a dry-run, mockable envelope",
      "side-effect",
    );
  }

  if (request.loweredPrompt === undefined) {
    return failure("MISSING_LOWERED_PROMPT", "model invocation runtime requires a lowered prompt envelope", "prompt");
  }

  if (!hasText(request.loweredPrompt.loweringId)) {
    return failure("MISSING_LOWERING_ID", "model invocation runtime requires a lowering id", "prompt");
  }

  if (request.capability === undefined) {
    return failure("MISSING_CAPABILITY", "model invocation runtime requires a bridged capability", "capability");
  }

  if (!hasText(request.capability.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "model invocation runtime requires a capability id", "capability");
  }

  if (request.carrier === undefined) {
    return failure("MISSING_CARRIER", "model invocation runtime requires a provider carrier reference", "carrier");
  }

  if (!hasText(request.carrier.carrierId)) {
    return failure("MISSING_CARRIER_ID", "model invocation runtime requires a provider carrier id", "carrier");
  }

  const runtimeId = request.runtimeId.trim();
  const loweringId = request.loweredPrompt.loweringId.trim();
  const invocationId = hasText(request.invocationId)
    ? request.invocationId.trim()
    : `${runtimeId}:modelInvocation:${loweringId}`;
  const mode = request.mode?.trim();
  const promptPackId = request.loweredPrompt.promptPackId?.trim();
  const capabilityKind = request.capability.kind?.trim();
  const provider = request.carrier.provider?.trim();
  const envelope: ModelInvocationMockableEnvelope = {
    loweringId,
    materialRefs: cleanList(request.loweredPrompt.materialRefs),
    capabilityId: request.capability.capabilityId.trim(),
    carrierId: request.carrier.carrierId.trim(),
    mode: mode !== undefined && mode.length > 0 ? mode : "single",
  };

  if (promptPackId !== undefined && promptPackId.length > 0) {
    envelope.promptPackId = promptPackId;
  }

  if (capabilityKind !== undefined && capabilityKind.length > 0) {
    envelope.capabilityKind = capabilityKind;
  }

  if (provider !== undefined && provider.length > 0) {
    envelope.provider = provider;
  }

  return {
    ok: true,
    plan: {
      invocationId,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.modelAdapter.modelInvocationRuntime",
      envelope,
      providerCallPermitted: false,
      transport: "mockable-envelope",
      metadata: request.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.modelInvocationRuntime.planned"],
  };
}
