/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：提供创建 runtime 实例的工厂能力，封装默认装配流程。
 * 能力要求1：需要隐藏内部装配细节，让开发者能稳定 new 出或获取一个 agentCore 实例。
 * 能力要求2：它应服务未来 OAO 和官方模块复用 agentCore 的使用方式。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type { AgentRuntimeHandle, AgentRuntimeHandleOperation } from "./agentRuntimeHandle.js";
import { createAgentRuntimeHandle } from "./agentRuntimeHandle.js";
import type { AgentRuntimeSession } from "./agentRuntimeSessionFactory.js";
import { createAgentRuntimeSession } from "./agentRuntimeSessionFactory.js";

export type AgentRuntimeFactorySourceKind = "dsl" | "spec" | "class" | "manifest" | "configuration";

export type AgentRuntimeFactoryErrorCode =
  | "MISSING_SOURCE"
  | "MISSING_RUNTIME_NAME"
  | "MISSING_APPLICATION_ID"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "ASSEMBLY_FAILED";

export type AgentRuntimeFactoryError = {
  code: AgentRuntimeFactoryErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance" | "runtime-state";
};

export type AgentRuntimeFactoryGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeFactorySource = {
  kind: AgentRuntimeFactorySourceKind;
  name: string;
  version?: string;
};

export type AgentRuntimeFactorySessionSeed = {
  agentId: string;
  sessionKey?: string;
  initialContextKeys?: readonly string[];
};

export type AgentRuntimeFactoryRequest = {
  source?: AgentRuntimeFactorySource;
  applicationId: string;
  requestedSurfaces?: readonly string[];
  enabledHandleOperations?: readonly AgentRuntimeHandleOperation[];
  visibleEventTypes?: readonly string[];
  sessions?: readonly AgentRuntimeFactorySessionSeed[];
  contract?: AgentRuntimeFactoryGate;
  governance?: AgentRuntimeFactoryGate;
};

export type AgentRuntimeInstance = {
  runtimeId: string;
  sourceKind: AgentRuntimeFactorySourceKind;
  name: string;
  version?: string;
  readiness: "ready";
  applicationId: string;
  assembledSurfaces: readonly string[];
  sessions: readonly AgentRuntimeSession[];
  handle: AgentRuntimeHandle;
  unsafeSideEffects: false;
};

export type AgentRuntimeFactoryResult =
  | {
      ok: true;
      runtime: AgentRuntimeInstance;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeFactoryError;
      events: readonly string[];
    };

const defaultSurfaces = [
  "runtime.applicationSurface",
  "runtime.governancePlane",
  "runtime.invocationMethod",
] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: AgentRuntimeFactoryErrorCode,
  message: string,
  boundary: AgentRuntimeFactoryError["boundary"],
): AgentRuntimeFactoryResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.factory.rejected"],
  };
}

export function createAgentRuntime(request: AgentRuntimeFactoryRequest): AgentRuntimeFactoryResult {
  if (request.source === undefined) {
    return failure("MISSING_SOURCE", "runtime factory requires a DSL, spec, class, manifest, or configuration source", "input");
  }

  if (isBlank(request.source.name)) {
    return failure("MISSING_RUNTIME_NAME", "runtime factory source must include a runtime name", "input");
  }

  if (isBlank(request.applicationId)) {
    return failure("MISSING_APPLICATION_ID", "applicationId is required before creating a runtime instance", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime factory source was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime factory was rejected by governance",
      "governance",
    );
  }

  const name = request.source.name.trim();
  const applicationId = request.applicationId.trim();
  const runtimeId = `${request.source.kind}:${name}`;
  const requestedSurfaces = cleanList(request.requestedSurfaces);
  const assembledSurfaces = requestedSurfaces.length > 0 ? requestedSurfaces : defaultSurfaces;
  const sessionSeeds = request.sessions?.length
    ? request.sessions
    : [{ agentId: name, sessionKey: "default" } satisfies AgentRuntimeFactorySessionSeed];
  const sessionResults = sessionSeeds.map((sessionSeed) =>
    createAgentRuntimeSession({
      runtimeId,
      applicationId,
      agentId: sessionSeed.agentId,
      sessionKey: sessionSeed.sessionKey,
      initialContextKeys: sessionSeed.initialContextKeys,
    }),
  );
  const failedSession = sessionResults.find((result) => !result.ok);

  if (failedSession !== undefined && !failedSession.ok) {
    return failure(
      "ASSEMBLY_FAILED",
      `runtime session assembly failed: ${failedSession.error.message}`,
      "runtime-state",
    );
  }

  const sessions = sessionResults.map((result) => {
    if (!result.ok) {
      throw new Error("unreachable session assembly failure");
    }

    return result.session;
  });

  const handleResult = createAgentRuntimeHandle({
    runtimeId,
    applicationId,
    visibleSessions: sessions.map((session) => session.sessionId),
    visibleEventTypes: request.visibleEventTypes,
    enabledOperations: request.enabledHandleOperations,
  });

  if (!handleResult.ok) {
    return failure("ASSEMBLY_FAILED", `runtime handle assembly failed: ${handleResult.error.message}`, "runtime-state");
  }

  return {
    ok: true,
    runtime: {
      runtimeId,
      sourceKind: request.source.kind,
      name,
      version: request.source.version,
      readiness: "ready",
      applicationId,
      assembledSurfaces,
      sessions,
      handle: handleResult.handle,
      unsafeSideEffects: false,
    },
    events: ["runtime.factory.created", ...sessionResults.flatMap((result) => result.events), ...handleResult.events],
  };
}
