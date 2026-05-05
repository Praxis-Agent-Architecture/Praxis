/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 bind Basic Interface Layer 这一能力位点。
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

export type BasicInterfaceLayerBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "binding";

export type BasicInterfaceKind = "CMP" | "MP" | "TAP" | "multiagent" | (string & {});

export type BasicInterfaceLayerErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BASIC_INTERFACE_LAYER"
  | "MISSING_BASIC_INTERFACE_LAYER_ID"
  | "EMPTY_BASIC_INTERFACES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type BasicInterfaceLayerError = {
  code: BasicInterfaceLayerErrorCode;
  message: string;
  boundary: BasicInterfaceLayerBoundary;
  publicSafe: true;
};

export type BasicInterfaceRef = {
  kind: BasicInterfaceKind;
  interfaceId: string;
  ruleRef?: string;
};

export type BasicInterfaceLayerInput = {
  id?: string;
  interfaces?: readonly BasicInterfaceRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type BasicInterfaceLayerBindingRequest = {
  runtimeId?: string;
  caller?: InterfaceAdapterRuntimeCaller;
  basicInterfaceLayer?: BasicInterfaceLayerInput;
  runtimeReady?: boolean;
  contract?: InterfaceAdapterRuntimeGate;
  governance?: InterfaceAdapterRuntimeGate;
};

export type BasicInterfaceLayerBinding = {
  bindingId: string;
  runtimeId: string;
  layerId: string;
  caller: InterfaceAdapterRuntimeCaller;
  surface: "basicInterfaceLayer";
  route: "runtime.interfaceAdapter.basicInterfaceLayer";
  interfaces: readonly BasicInterfaceRef[];
  interfaceKinds: readonly BasicInterfaceKind[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type BasicInterfaceLayerBindingResult =
  | {
      ok: true;
      binding: BasicInterfaceLayerBinding;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BasicInterfaceLayerError;
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

function normalizeInterfaces(interfaces: readonly BasicInterfaceRef[] | undefined): readonly BasicInterfaceRef[] {
  return (interfaces ?? [])
    .map((interfaceRef) => {
      const normalized: BasicInterfaceRef = {
        kind: interfaceRef.kind.trim(),
        interfaceId: interfaceRef.interfaceId.trim(),
      };
      const ruleRef = interfaceRef.ruleRef?.trim();
      if (ruleRef !== undefined && ruleRef.length > 0) {
        normalized.ruleRef = ruleRef;
      }
      return normalized;
    })
    .filter((interfaceRef) => interfaceRef.kind.length > 0 && interfaceRef.interfaceId.length > 0);
}

function failure(
  code: BasicInterfaceLayerErrorCode,
  message: string,
  boundary: BasicInterfaceLayerBoundary,
): BasicInterfaceLayerBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.interfaceAdapter.basicInterfaceLayer.rejected"],
  };
}

export function bindBasicInterfaceLayer(
  request?: BasicInterfaceLayerBindingRequest,
): BasicInterfaceLayerBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "basicInterfaceLayer binding requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "basicInterfaceLayer binding requires a caller", "input");
  }

  if (request.basicInterfaceLayer === undefined) {
    return failure("MISSING_BASIC_INTERFACE_LAYER", "basicInterfaceLayer binding requires a layer input", "input");
  }

  if (!hasText(request.basicInterfaceLayer.id)) {
    return failure("MISSING_BASIC_INTERFACE_LAYER_ID", "basicInterfaceLayer binding requires a stable layer id", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "basicInterfaceLayer can only bind through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "basicInterfaceLayer binding was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "basicInterfaceLayer binding was rejected by governance",
      "governance",
    );
  }

  const interfaces = normalizeInterfaces(request.basicInterfaceLayer.interfaces);
  if (interfaces.length === 0) {
    return failure(
      "EMPTY_BASIC_INTERFACES",
      "basicInterfaceLayer binding requires at least one official or built-in interface reference",
      "binding",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const layerId = request.basicInterfaceLayer.id.trim();

  return {
    ok: true,
    binding: {
      bindingId: `${runtimeId}:basicInterfaceLayer:${layerId}`,
      runtimeId,
      layerId,
      caller: normalizeCaller(request.caller),
      surface: "basicInterfaceLayer",
      route: "runtime.interfaceAdapter.basicInterfaceLayer",
      interfaces,
      interfaceKinds: [...new Set(interfaces.map((interfaceRef) => interfaceRef.kind))],
      metadata: request.basicInterfaceLayer.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.interfaceAdapter.basicInterfaceLayer.bound"],
  };
}
