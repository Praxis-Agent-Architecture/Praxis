/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 invocation Result Surface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { InvocationMethodKind } from "./invocationMethodRegistry.js";

export type InvocationResultSurfaceStatus = "accepted" | "completed" | "failed";

export type InvocationResultSurfaceBoundary = "input" | "contract" | "governance" | "runtime" | "downstream";

export type InvocationResultSurfaceErrorCode =
  | "MISSING_INVOCATION_ID"
  | "MISSING_METHOD"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "DOWNSTREAM_FAILED";

export type InvocationResultSurfaceError = {
  code: InvocationResultSurfaceErrorCode | string;
  message: string;
  boundary: InvocationResultSurfaceBoundary;
};

export type InvocationResultSurfaceGate = {
  accepted: boolean;
  reason?: string;
};

export type InvocationResultSurfaceRequest = {
  invocationId?: string;
  method?: InvocationMethodKind | string;
  routeId?: string;
  status?: InvocationResultSurfaceStatus;
  output?: unknown;
  error?: {
    code: string;
    message: string;
    boundary?: InvocationResultSurfaceBoundary;
  };
  events?: readonly string[];
  contract?: InvocationResultSurfaceGate;
  governance?: InvocationResultSurfaceGate;
};

export type InvocationResultSurfaceView = {
  invocationId: string;
  method: InvocationMethodKind | string;
  routeId?: string;
  status: InvocationResultSurfaceStatus;
  output?: unknown;
  error?: InvocationResultSurfaceError;
  events: readonly string[];
  providerRawShapeExposed: false;
};

export type InvocationResultSurfaceResult =
  | {
      ok: true;
      surface: InvocationResultSurfaceView;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationResultSurfaceError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure(
  code: InvocationResultSurfaceErrorCode,
  message: string,
  boundary: InvocationResultSurfaceBoundary,
): InvocationResultSurfaceResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["invocation.result.surface.rejected"],
  };
}

function eventSet(values: readonly string[] | undefined, fallback: string): readonly string[] {
  return [...new Set([...(values ?? []), fallback])];
}

export function createInvocationResultSurface(
  request: InvocationResultSurfaceRequest,
): InvocationResultSurfaceResult {
  const invocationId = request.invocationId?.trim();
  const method = request.method?.trim();

  if (!hasText(invocationId)) {
    return failure("MISSING_INVOCATION_ID", "invocationId is required before exposing invocation results", "input");
  }

  if (!hasText(method)) {
    return failure("MISSING_METHOD", "method is required before exposing invocation results", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "invocation result was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "invocation result was rejected by governance",
      "governance",
    );
  }

  if (request.error !== undefined) {
    const error: InvocationResultSurfaceError = {
      code: request.error.code || "DOWNSTREAM_FAILED",
      message: request.error.message || "downstream invocation failed",
      boundary: request.error.boundary ?? "downstream",
    };

    return {
      ok: true,
      surface: {
        invocationId,
        method,
        routeId: request.routeId?.trim() || undefined,
        status: "failed",
        error,
        events: eventSet(request.events, "invocation.result.failed"),
        providerRawShapeExposed: false,
      },
      events: ["invocation.result.surface.ready"],
    };
  }

  return {
    ok: true,
    surface: {
      invocationId,
      method,
      routeId: request.routeId?.trim() || undefined,
      status: request.status ?? "completed",
      output: request.output,
      events: eventSet(request.events, "invocation.result.presented"),
      providerRawShapeExposed: false,
    },
    events: ["invocation.result.surface.ready"],
  };
}
