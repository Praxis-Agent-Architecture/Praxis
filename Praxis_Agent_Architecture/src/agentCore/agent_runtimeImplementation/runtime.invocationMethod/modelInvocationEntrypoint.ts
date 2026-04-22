/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 model Invocation Entrypoint 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createInvocationMethodRegistry,
  type InvocationMethodRegistry,
} from "./invocationMethodRegistry.js";
import { routeInvocation, type InvocationRouteBoundary } from "./invocationRouter.js";

export type ModelInvocationInputKind = "prompt-pack-ref" | "message" | "command" | "tool-summary";

export type ModelInvocationBoundary = "input" | "contract" | "governance" | "runtime" | "registry";

export type ModelInvocationEntrypointErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_MODEL_CAPABILITY_ID"
  | "MISSING_INPUT"
  | "REGISTRY_UNAVAILABLE"
  | "ROUTE_REJECTED";

export type ModelInvocationEntrypointError = {
  code: ModelInvocationEntrypointErrorCode;
  message: string;
  boundary: ModelInvocationBoundary;
};

export type ModelInvocationGate = {
  accepted: boolean;
  reason?: string;
};

export type ModelInvocationInput = {
  kind: ModelInvocationInputKind;
  value: unknown;
};

export type ModelInvocationEntrypointRequest = {
  runtimeId?: string;
  invocationId?: string;
  modelCapabilityId?: string;
  input?: ModelInvocationInput;
  registry?: InvocationMethodRegistry;
  runtimeReady?: boolean;
  contract?: ModelInvocationGate;
  governance?: ModelInvocationGate;
};

export type ModelInvocationEnvelope = {
  runtimeId: string;
  invocationId: string;
  modelCapabilityId: string;
  inputKind: ModelInvocationInputKind;
  routeId: string;
  targetSurfaceId: string;
  dryRun: true;
  providerCallPlanned: false;
  governanceChecked: true;
  contractChecked: true;
};

export type ModelInvocationEntrypointResult =
  | {
      ok: true;
      envelope: ModelInvocationEnvelope;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelInvocationEntrypointError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: ModelInvocationEntrypointErrorCode,
  message: string,
  boundary: ModelInvocationBoundary,
): ModelInvocationEntrypointResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["model.invocation.entrypoint.rejected"],
  };
}

function mapRouteBoundary(boundary: InvocationRouteBoundary): ModelInvocationBoundary {
  return boundary;
}

function defaultModelRegistry(): InvocationMethodRegistry | ModelInvocationEntrypointResult {
  const registryResult = createInvocationMethodRegistry({
    methods: [
      {
        method: "model",
        surfaceId: "runtime.modelAdapter.promptLoweringRuntime",
        capability: "model.invoke",
      },
    ],
  });

  if (!registryResult.ok) {
    return failure("REGISTRY_UNAVAILABLE", registryResult.error.message, registryResult.error.boundary);
  }

  return registryResult.registry;
}

export function openModelInvocationEntrypoint(
  request: ModelInvocationEntrypointRequest,
): ModelInvocationEntrypointResult {
  const runtimeId = request.runtimeId?.trim();
  const modelCapabilityId = request.modelCapabilityId?.trim();

  if (!hasText(runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "runtimeId is required before opening model invocation", "input");
  }

  if (!hasText(modelCapabilityId)) {
    return failure(
      "MISSING_MODEL_CAPABILITY_ID",
      "modelCapabilityId is required before opening model invocation",
      "input",
    );
  }

  if (request.input === undefined) {
    return failure("MISSING_INPUT", "model invocation requires a prompt-pack reference or model input", "input");
  }

  const registry = request.registry ?? defaultModelRegistry();
  if ("ok" in registry) {
    return registry;
  }

  const invocationId = request.invocationId?.trim() || `${runtimeId}:model:${modelCapabilityId}`;
  const routed = routeInvocation({
    registry,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
    envelope: {
      invocationId,
      method: "model",
      target: modelCapabilityId,
      source: "runtime",
      payload: {
        inputKind: request.input.kind,
        input: request.input.value,
      },
    },
  });

  if (!routed.ok) {
    return failure("ROUTE_REJECTED", routed.error.message, mapRouteBoundary(routed.error.boundary));
  }

  return {
    ok: true,
    envelope: {
      runtimeId,
      invocationId,
      modelCapabilityId,
      inputKind: request.input.kind,
      routeId: routed.route.routeId,
      targetSurfaceId: routed.route.surfaceId,
      dryRun: true,
      providerCallPlanned: false,
      governanceChecked: true,
      contractChecked: true,
    },
    events: ["model.invocation.entrypoint.accepted", ...routed.events],
  };
}
