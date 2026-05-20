/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 invocation Router 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { InvocationMethodKind, InvocationMethodRegistry } from "./invocationMethodRegistry.js";

export type InvocationRouteBoundary = "input" | "contract" | "governance" | "runtime" | "registry";

export type InvocationRouteErrorCode =
  | "MISSING_ENVELOPE"
  | "MISSING_REGISTRY"
  | "MISSING_INVOCATION_ID"
  | "MISSING_METHOD"
  | "MISSING_TARGET"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "METHOD_NOT_REGISTERED"
  | "METHOD_DISABLED"
  | "UNKNOWN_METHOD";

export type InvocationRouteError = {
  code: InvocationRouteErrorCode;
  message: string;
  boundary: InvocationRouteBoundary;
};

export type InvocationRouteGate = {
  accepted: boolean;
  reason?: string;
};

export type InvocationRouteEnvelope = {
  invocationId?: string;
  method?: InvocationMethodKind | string;
  target?: string;
  payload?: unknown;
  source?: "application" | "official-module" | "runtime" | "test";
};

export type InvocationRoute = {
  routeId: string;
  invocationId: string;
  method: InvocationMethodKind;
  surfaceId: string;
  target: string;
  source: "application" | "official-module" | "runtime" | "test";
  payload?: unknown;
  dryRun: true;
  governanceChecked: true;
  contractChecked: true;
};

export type InvocationRouterRequest = {
  envelope?: InvocationRouteEnvelope;
  registry?: InvocationMethodRegistry;
  runtimeReady?: boolean;
  contract?: InvocationRouteGate;
  governance?: InvocationRouteGate;
};

export type InvocationRouterResult =
  | {
      ok: true;
      route: InvocationRoute;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationRouteError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(code: InvocationRouteErrorCode, message: string, boundary: InvocationRouteBoundary): InvocationRouterResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["invocation.route.rejected"],
  };
}

function toRouteErrorCode(code: string): InvocationRouteErrorCode {
  if (code === "METHOD_DISABLED") {
    return "METHOD_DISABLED";
  }

  if (code === "UNKNOWN_METHOD") {
    return "UNKNOWN_METHOD";
  }

  return "METHOD_NOT_REGISTERED";
}

export function routeInvocation(request: InvocationRouterRequest): InvocationRouterResult {
  if (request.envelope === undefined) {
    return failure("MISSING_ENVELOPE", "invocation router requires an invocation envelope", "input");
  }

  if (request.registry === undefined) {
    return failure("MISSING_REGISTRY", "invocation router requires an invocation method registry", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "runtime must be ready before invocation routing", "runtime");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "invocation route was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "invocation route was rejected by governance",
      "governance",
    );
  }

  const { envelope } = request;
  const invocationId = envelope.invocationId?.trim();
  const method = envelope.method?.trim();
  const target = envelope.target?.trim();

  if (!hasText(invocationId)) {
    return failure("MISSING_INVOCATION_ID", "invocationId is required before routing", "input");
  }

  if (!hasText(method)) {
    return failure("MISSING_METHOD", "method is required before routing", "input");
  }

  if (!hasText(target)) {
    return failure("MISSING_TARGET", "target is required before routing", "input");
  }

  const resolved = request.registry.resolve(method);
  if (!resolved.ok) {
    return failure(toRouteErrorCode(resolved.error.code), resolved.error.message, resolved.error.boundary);
  }

  return {
    ok: true,
    route: {
      routeId: `${invocationId}:${resolved.method.method}:${resolved.method.surfaceId}`,
      invocationId,
      method: resolved.method.method,
      surfaceId: resolved.method.surfaceId,
      target,
      source: envelope.source ?? "application",
      payload: envelope.payload,
      dryRun: true,
      governanceChecked: true,
      contractChecked: true,
    },
    events: ["invocation.route.accepted", ...resolved.events],
  };
}
