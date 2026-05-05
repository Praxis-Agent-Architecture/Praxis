/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 bind Actual Invocation Layer 这一能力位点。
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

export type ActualInvocationLayerProvider =
  | "openai"
  | "anthropic"
  | "deepmind"
  | "customFormat"
  | (string & {});

export type ActualInvocationLayerBindingBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "binding";

export type ActualInvocationLayerBindingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_INVOCATION_LAYER"
  | "MISSING_INVOCATION_LAYER_ID"
  | "EMPTY_PROVIDER_CARRIERS"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ActualInvocationLayerBindingError = {
  code: ActualInvocationLayerBindingErrorCode;
  message: string;
  boundary: ActualInvocationLayerBindingBoundary;
  publicSafe: true;
};

export type ActualInvocationProviderCarrierRef = {
  provider: ActualInvocationLayerProvider;
  carrierId: string;
  endpointShape?: "responses" | "messages" | "completion" | "embedding" | "custom" | (string & {});
};

export type ActualInvocationLayerBindingInput = {
  id?: string;
  carriers?: readonly ActualInvocationProviderCarrierRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ActualInvocationLayerBindingRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  actualInvocationLayer?: ActualInvocationLayerBindingInput;
  runtimeReady?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type ActualInvocationLayerBinding = {
  bindingId: string;
  runtimeId: string;
  layerId: string;
  caller: ModelAdapterRuntimeCaller;
  surface: "actualInvocationLayer";
  route: "runtime.modelAdapter.actualInvocationLayer";
  carriers: readonly ActualInvocationProviderCarrierRef[];
  providers: readonly ActualInvocationLayerProvider[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ActualInvocationLayerBindingResult =
  | {
      ok: true;
      binding: ActualInvocationLayerBinding;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ActualInvocationLayerBindingError;
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

function normalizeCarriers(
  carriers: readonly ActualInvocationProviderCarrierRef[] | undefined,
): readonly ActualInvocationProviderCarrierRef[] {
  return (carriers ?? [])
    .map((carrier) => {
      const normalized: ActualInvocationProviderCarrierRef = {
        provider: carrier.provider.trim(),
        carrierId: carrier.carrierId.trim(),
      };
      const endpointShape = carrier.endpointShape?.trim();
      if (endpointShape !== undefined && endpointShape.length > 0) {
        normalized.endpointShape = endpointShape;
      }
      return normalized;
    })
    .filter((carrier) => carrier.provider.length > 0 && carrier.carrierId.length > 0);
}

function failure(
  code: ActualInvocationLayerBindingErrorCode,
  message: string,
  boundary: ActualInvocationLayerBindingBoundary,
): ActualInvocationLayerBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.actualInvocationLayer.rejected"],
  };
}

export function bindActualInvocationLayer(
  request?: ActualInvocationLayerBindingRequest,
): ActualInvocationLayerBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "actualInvocationLayer binding requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "actualInvocationLayer binding requires a caller", "input");
  }

  if (request.actualInvocationLayer === undefined) {
    return failure(
      "MISSING_INVOCATION_LAYER",
      "actualInvocationLayer binding requires an invocation layer input",
      "input",
    );
  }

  if (!hasText(request.actualInvocationLayer.id)) {
    return failure(
      "MISSING_INVOCATION_LAYER_ID",
      "actualInvocationLayer binding requires a stable layer id",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "actualInvocationLayer can only bind through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "actualInvocationLayer binding was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "actualInvocationLayer binding was rejected by governance",
      "governance",
    );
  }

  const carriers = normalizeCarriers(request.actualInvocationLayer.carriers);
  if (carriers.length === 0) {
    return failure(
      "EMPTY_PROVIDER_CARRIERS",
      "actualInvocationLayer binding requires at least one provider or customFormat carrier",
      "binding",
    );
  }

  const runtimeId = request.runtimeId.trim();
  const layerId = request.actualInvocationLayer.id.trim();

  return {
    ok: true,
    binding: {
      bindingId: `${runtimeId}:actualInvocationLayer:${layerId}`,
      runtimeId,
      layerId,
      caller: normalizeCaller(request.caller),
      surface: "actualInvocationLayer",
      route: "runtime.modelAdapter.actualInvocationLayer",
      carriers,
      providers: [...new Set(carriers.map((carrier) => carrier.provider))],
      metadata: request.actualInvocationLayer.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.actualInvocationLayer.bound"],
  };
}
