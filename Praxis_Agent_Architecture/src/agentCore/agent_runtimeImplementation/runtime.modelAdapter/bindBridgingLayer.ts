/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 bind Bridging Layer 这一能力位点。
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

export type BridgedModelCapabilityKind =
  | "text-generation"
  | "tool-call"
  | "embedding"
  | "multimodal"
  | "streaming"
  | (string & {});

export type BridgingLayerBindingBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "binding";

export type BridgingLayerBindingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BRIDGING_LAYER"
  | "MISSING_BRIDGING_LAYER_ID"
  | "EMPTY_BRIDGED_CAPABILITIES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type BridgingLayerBindingError = {
  code: BridgingLayerBindingErrorCode;
  message: string;
  boundary: BridgingLayerBindingBoundary;
  publicSafe: true;
};

export type BridgedModelCapabilityRef = {
  kind: BridgedModelCapabilityKind;
  ref: string;
  abstractionRef?: string;
};

export type BridgingLayerBindingInput = {
  id?: string;
  capabilities?: readonly BridgedModelCapabilityRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type BridgingLayerBindingRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  bridgingLayer?: BridgingLayerBindingInput;
  runtimeReady?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type BridgingLayerBinding = {
  bindingId: string;
  runtimeId: string;
  layerId: string;
  caller: ModelAdapterRuntimeCaller;
  surface: "bridgingLayer";
  route: "runtime.modelAdapter.bridgingLayer";
  capabilities: readonly BridgedModelCapabilityRef[];
  capabilityKinds: readonly BridgedModelCapabilityKind[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type BridgingLayerBindingResult =
  | {
      ok: true;
      binding: BridgingLayerBinding;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BridgingLayerBindingError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function normalizeCapabilities(
  capabilities: readonly BridgedModelCapabilityRef[] | undefined,
): readonly BridgedModelCapabilityRef[] {
  return (capabilities ?? [])
    .map((capability) => {
      const normalized: BridgedModelCapabilityRef = {
        kind: capability.kind.trim(),
        ref: capability.ref.trim(),
      };
      const abstractionRef = capability.abstractionRef?.trim();
      if (abstractionRef !== undefined && abstractionRef.length > 0) {
        normalized.abstractionRef = abstractionRef;
      }
      return normalized;
    })
    .filter((capability) => capability.kind.length > 0 && capability.ref.length > 0);
}

function failure(
  code: BridgingLayerBindingErrorCode,
  message: string,
  boundary: BridgingLayerBindingBoundary,
): BridgingLayerBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.bridgingLayer.rejected"],
  };
}

export function bindBridgingLayer(request?: BridgingLayerBindingRequest): BridgingLayerBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "bridgingLayer binding requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "bridgingLayer binding requires a caller", "input");
  }

  if (request.bridgingLayer === undefined) {
    return failure("MISSING_BRIDGING_LAYER", "bridgingLayer binding requires a bridging input", "input");
  }

  if (!hasText(request.bridgingLayer.id)) {
    return failure("MISSING_BRIDGING_LAYER_ID", "bridgingLayer binding requires a stable layer id", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "bridgingLayer can only bind through a ready runtime host", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "bridgingLayer binding was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "bridgingLayer binding was rejected by governance",
      "governance",
    );
  }

  const capabilities = normalizeCapabilities(request.bridgingLayer.capabilities);
  if (capabilities.length === 0) {
    return failure(
      "EMPTY_BRIDGED_CAPABILITIES",
      "bridgingLayer binding requires at least one internal model capability reference",
      "binding",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const layerId = request.bridgingLayer.id.trim();

  return {
    ok: true,
    binding: {
      bindingId: `${runtimeId}:bridgingLayer:${layerId}`,
      runtimeId,
      layerId,
      caller: normalizeCaller(request.caller),
      surface: "bridgingLayer",
      route: "runtime.modelAdapter.bridgingLayer",
      capabilities,
      capabilityKinds: [...new Set(capabilities.map((capability) => capability.kind))],
      metadata: request.bridgingLayer.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.bridgingLayer.bound"],
  };
}
