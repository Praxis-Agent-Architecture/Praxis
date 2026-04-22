/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：提供客户端式调用 API，让应用更方便地使用 runtime。
 * 能力要求1：需要封装 invoke、stream、inspect、subscribe、control 等常见操作。
 * 能力要求2：它面向开发者体验，而不是内部模块间细节。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AgentApplicationRuntimeSurface } from "./agentApplicationRuntime.js";

export type AgentRuntimeClientOperation = "invoke" | "stream" | "inspect" | "subscribe" | "control";

export type AgentRuntimeClientErrorCode =
  | "MISSING_RUNTIME_SURFACE"
  | "UNSUPPORTED_OPERATION"
  | "GOVERNANCE_REJECTED";

export type AgentRuntimeClientError = {
  code: AgentRuntimeClientErrorCode;
  message: string;
  boundary: "input" | "governance";
};

export type AgentRuntimeClientGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeClientRequest = {
  surface?: AgentApplicationRuntimeSurface;
  enabledOperations?: readonly AgentRuntimeClientOperation[];
  governance?: AgentRuntimeClientGate;
};

export type AgentRuntimeClientCall = {
  operation: AgentRuntimeClientOperation;
  payload?: unknown;
};

export type AgentRuntimeClientCallResult =
  | {
      ok: true;
      operation: AgentRuntimeClientOperation;
      runtimeId: string;
      applicationId: string;
      accepted: true;
      dryRun: true;
    }
  | {
      ok: false;
      error: AgentRuntimeClientError;
    };

export type AgentRuntimeClient = {
  runtimeId: string;
  applicationId: string;
  enabledOperations: readonly AgentRuntimeClientOperation[];
  call: (call: AgentRuntimeClientCall) => AgentRuntimeClientCallResult;
};

export type AgentRuntimeClientResult =
  | {
      ok: true;
      client: AgentRuntimeClient;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeClientError;
      events: readonly string[];
    };

const defaultClientOperations = ["invoke", "stream", "inspect", "subscribe", "control"] as const;

function failure(
  code: AgentRuntimeClientErrorCode,
  message: string,
  boundary: AgentRuntimeClientError["boundary"],
): AgentRuntimeClientResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.client.rejected"],
  };
}

function callFailure(
  code: AgentRuntimeClientErrorCode,
  message: string,
  boundary: AgentRuntimeClientError["boundary"],
): AgentRuntimeClientCallResult {
  return {
    ok: false,
    error: { code, message, boundary },
  };
}

function cleanOperations(values: readonly AgentRuntimeClientOperation[] | undefined): readonly AgentRuntimeClientOperation[] {
  return [...new Set(values ?? defaultClientOperations)];
}

export function createAgentRuntimeClient(request: AgentRuntimeClientRequest): AgentRuntimeClientResult {
  if (request.surface === undefined) {
    return failure("MISSING_RUNTIME_SURFACE", "runtime client requires an application runtime surface", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime client creation was rejected by governance",
      "governance",
    );
  }

  const enabledOperations = cleanOperations(request.enabledOperations);
  const { runtimeId, applicationId } = request.surface;

  return {
    ok: true,
    client: {
      runtimeId,
      applicationId,
      enabledOperations,
      call(call: AgentRuntimeClientCall): AgentRuntimeClientCallResult {
        if (!enabledOperations.includes(call.operation)) {
          return callFailure(
            "UNSUPPORTED_OPERATION",
            `operation ${call.operation} is not enabled for this runtime client`,
            "input",
          );
        }

        return {
          ok: true,
          operation: call.operation,
          runtimeId,
          applicationId,
          accepted: true,
          dryRun: true,
        };
      },
    },
    events: ["runtime.client.ready"],
  };
}
