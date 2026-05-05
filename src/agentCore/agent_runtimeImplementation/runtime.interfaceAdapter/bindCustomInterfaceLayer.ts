/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 bind Custom Interface Layer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  InterfaceAdapterRuntimeCaller,
  InterfaceAdapterRuntimeGate,
} from "./interfaceAdapterRuntime.js";

export type CustomInterfaceLayerBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "binding";

export type CustomInterfaceLifecycle = "registered" | "reused" | "suspended" | (string & {});

export type CustomInterfaceLayerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_CUSTOM_INTERFACE_LAYER"
  | "MISSING_CUSTOM_INTERFACE_LAYER_ID"
  | "EMPTY_CUSTOM_INTERFACES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type CustomInterfaceLayerError = {
  code: CustomInterfaceLayerErrorCode;
  message: string;
  boundary: CustomInterfaceLayerBoundary;
  publicSafe: true;
};

export type CustomInterfaceDefinitionRef = {
  interfaceId: string;
  contractRef: string;
  lifecycle?: CustomInterfaceLifecycle;
  ruleRef?: string;
};

export type CustomInterfaceLayerInput = {
  id?: string;
  source?: "application" | "official-module" | "runtime" | "test";
  definitions?: readonly CustomInterfaceDefinitionRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomInterfaceLayerBindingRequest = {
  runtimeId?: string;
  caller?: InterfaceAdapterRuntimeCaller;
  customInterfaceLayer?: CustomInterfaceLayerInput;
  runtimeReady?: boolean;
  contract?: InterfaceAdapterRuntimeGate;
  governance?: InterfaceAdapterRuntimeGate;
};

export type CustomInterfaceLayerBinding = {
  bindingId: string;
  runtimeId: string;
  layerId: string;
  caller: InterfaceAdapterRuntimeCaller;
  source: "application" | "official-module" | "runtime" | "test";
  surface: "customInterfaceLayer";
  route: "runtime.interfaceAdapter.customInterfaceLayer";
  definitions: readonly CustomInterfaceDefinitionRef[];
  interfaceIds: readonly string[];
  contractRefs: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type CustomInterfaceLayerBindingResult =
  | {
      ok: true;
      binding: CustomInterfaceLayerBinding;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceLayerError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: InterfaceAdapterRuntimeCaller): InterfaceAdapterRuntimeCaller {
  const normalized: InterfaceAdapterRuntimeCaller = {
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

function normalizeDefinitions(
  definitions: readonly CustomInterfaceDefinitionRef[] | undefined,
): readonly CustomInterfaceDefinitionRef[] {
  return (definitions ?? [])
    .map((definition) => {
      const normalized: CustomInterfaceDefinitionRef = {
        interfaceId: definition.interfaceId.trim(),
        contractRef: definition.contractRef.trim(),
      };

      const lifecycle = definition.lifecycle?.trim();
      if (lifecycle !== undefined && lifecycle.length > 0) {
        normalized.lifecycle = lifecycle;
      }

      const ruleRef = definition.ruleRef?.trim();
      if (ruleRef !== undefined && ruleRef.length > 0) {
        normalized.ruleRef = ruleRef;
      }

      return normalized;
    })
    .filter((definition) => definition.interfaceId.length > 0 && definition.contractRef.length > 0);
}

function failure(
  code: CustomInterfaceLayerErrorCode,
  message: string,
  boundary: CustomInterfaceLayerBoundary,
): CustomInterfaceLayerBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.interfaceAdapter.customInterfaceLayer.rejected"],
  };
}

export function bindCustomInterfaceLayer(
  request?: CustomInterfaceLayerBindingRequest,
): CustomInterfaceLayerBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "customInterfaceLayer binding requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "customInterfaceLayer binding requires a caller", "input");
  }

  if (request.customInterfaceLayer === undefined) {
    return failure("MISSING_CUSTOM_INTERFACE_LAYER", "customInterfaceLayer binding requires a layer input", "input");
  }

  if (!hasText(request.customInterfaceLayer.id)) {
    return failure("MISSING_CUSTOM_INTERFACE_LAYER_ID", "customInterfaceLayer binding requires a stable layer id", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "customInterfaceLayer can only bind through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "customInterfaceLayer binding was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "customInterfaceLayer binding was rejected by governance",
      "governance",
    );
  }

  const definitions = normalizeDefinitions(request.customInterfaceLayer.definitions);
  if (definitions.length === 0) {
    return failure(
      "EMPTY_CUSTOM_INTERFACES",
      "customInterfaceLayer binding requires at least one custom interface contract reference",
      "binding",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const layerId = request.customInterfaceLayer.id.trim();

  return {
    ok: true,
    binding: {
      bindingId: `${runtimeId}:customInterfaceLayer:${layerId}`,
      runtimeId,
      layerId,
      caller: normalizeCaller(request.caller),
      source: request.customInterfaceLayer.source ?? "application",
      surface: "customInterfaceLayer",
      route: "runtime.interfaceAdapter.customInterfaceLayer",
      definitions,
      interfaceIds: [...new Set(definitions.map((definition) => definition.interfaceId))],
      contractRefs: [...new Set(definitions.map((definition) => definition.contractRef))],
      metadata: request.customInterfaceLayer.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.interfaceAdapter.customInterfaceLayer.bound"],
  };
}
