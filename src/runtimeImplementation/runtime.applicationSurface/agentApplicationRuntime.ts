/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：作为上层 Agent 应用使用 agentCore runtime 的主入口。
 * 能力要求1：应用通过它创建、调用、观察和管理 Agent，而不是直接触碰执行引擎。
 * 能力要求2：它需要承托官方上层产品和第三方 Agent 应用共同使用 Praxis 的方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AgentApplicationMountRecord } from "./agentApplicationMount.js";
import type { AgentRuntimeDescriptor } from "./agentRuntimeBuilder.js";

export type AgentApplicationRuntimeErrorCode =
  | "MISSING_RUNTIME"
  | "RUNTIME_NOT_READY"
  | "APPLICATION_NOT_MOUNTED"
  | "GOVERNANCE_REJECTED";

export type AgentApplicationRuntimeError = {
  code: AgentApplicationRuntimeErrorCode;
  message: string;
  boundary: "input" | "runtime-state" | "governance";
};

export type AgentApplicationRuntimeGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentApplicationRuntimeRequest = {
  runtime?: AgentRuntimeDescriptor;
  mount?: AgentApplicationMountRecord;
  operation?: "create" | "invoke" | "observe" | "manage";
  governance?: AgentApplicationRuntimeGate;
};

export type AgentApplicationRuntimeSurface = {
  runtimeId: string;
  applicationId: string;
  operation: "create" | "invoke" | "observe" | "manage";
  status: "ready";
  visibleContext: {
    sourceKind: AgentRuntimeDescriptor["sourceKind"];
    assembledSurfaces: readonly string[];
    mountId: string;
  };
};

export type AgentApplicationRuntimeResult =
  | {
      ok: true;
      surface: AgentApplicationRuntimeSurface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentApplicationRuntimeError;
      events: readonly string[];
    };

function failure(
  code: AgentApplicationRuntimeErrorCode,
  message: string,
  boundary: AgentApplicationRuntimeError["boundary"],
): AgentApplicationRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["application.runtime.rejected"],
  };
}

export function createAgentApplicationRuntime(
  request: AgentApplicationRuntimeRequest,
): AgentApplicationRuntimeResult {
  if (request.runtime === undefined) {
    return failure("MISSING_RUNTIME", "application runtime requires a built runtime descriptor", "input");
  }

  if (request.runtime.readiness !== "ready") {
    return failure("RUNTIME_NOT_READY", "application runtime can only expose a ready runtime", "runtime-state");
  }

  if (request.mount === undefined) {
    return failure("APPLICATION_NOT_MOUNTED", "application must be mounted before using the runtime surface", "input");
  }

  if (request.mount.runtimeId !== request.runtime.runtimeId) {
    return failure("APPLICATION_NOT_MOUNTED", "application mount does not belong to the provided runtime", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "application runtime access was rejected by governance",
      "governance",
    );
  }

  return {
    ok: true,
    surface: {
      runtimeId: request.runtime.runtimeId,
      applicationId: request.mount.applicationId,
      operation: request.operation ?? "create",
      status: "ready",
      visibleContext: {
        sourceKind: request.runtime.sourceKind,
        assembledSurfaces: request.runtime.assembledSurfaces,
        mountId: request.mount.mountId,
      },
    },
    events: ["application.runtime.ready"],
  };
}
