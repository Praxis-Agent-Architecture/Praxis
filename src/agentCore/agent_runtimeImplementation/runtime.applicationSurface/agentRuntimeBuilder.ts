/*
 * 文件定位：Agent 运行态实现层 / 应用承托面。
 * 核心目的：根据 DSL、Spec、Class、manifest 或配置构建 Agent runtime。
 * 能力要求1：需要把执行引擎、模型适配、接口适配、治理面和官方模块承托面装配起来。
 * 能力要求2：它是从“声明/配置”走向“可运行 Agent”的构建入口。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type AgentRuntimeBuildSourceKind = "dsl" | "spec" | "class" | "manifest" | "configuration";

export type AgentRuntimeBuildErrorCode =
  | "MISSING_SOURCE"
  | "MISSING_RUNTIME_NAME"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type AgentRuntimeBuildError = {
  code: AgentRuntimeBuildErrorCode;
  message: string;
  boundary: "input" | "contract" | "governance";
};

export type AgentRuntimeBuildGate = {
  accepted: boolean;
  reason?: string;
};

export type AgentRuntimeBuildSource = {
  kind: AgentRuntimeBuildSourceKind;
  name: string;
  version?: string;
};

export type AgentRuntimeBuildRequest = {
  source?: AgentRuntimeBuildSource;
  requestedSurfaces?: readonly string[];
  contract?: AgentRuntimeBuildGate;
  governance?: AgentRuntimeBuildGate;
};

export type AgentRuntimeDescriptor = {
  runtimeId: string;
  sourceKind: AgentRuntimeBuildSourceKind;
  name: string;
  version?: string;
  readiness: "building" | "ready" | "failed";
  assembledSurfaces: readonly string[];
  unsafeSideEffects: false;
};

export type AgentRuntimeBuildResult =
  | {
      ok: true;
      runtime: AgentRuntimeDescriptor;
      events: readonly string[];
    }
  | {
      ok: false;
      error: AgentRuntimeBuildError;
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
  code: AgentRuntimeBuildErrorCode,
  message: string,
  boundary: AgentRuntimeBuildError["boundary"],
): AgentRuntimeBuildResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["runtime.build.rejected"],
  };
}

export function buildAgentRuntime(request: AgentRuntimeBuildRequest): AgentRuntimeBuildResult {
  if (request.source === undefined) {
    return failure("MISSING_SOURCE", "runtime build requires a DSL, spec, class, manifest, or configuration source", "input");
  }

  if (isBlank(request.source.name)) {
    return failure("MISSING_RUNTIME_NAME", "runtime build source must include a name", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "runtime build source was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "runtime build was rejected by governance",
      "governance",
    );
  }

  const name = request.source.name.trim();
  const requestedSurfaces = cleanList(request.requestedSurfaces);
  const assembledSurfaces = requestedSurfaces.length > 0 ? requestedSurfaces : defaultSurfaces;

  return {
    ok: true,
    runtime: {
      runtimeId: `${request.source.kind}:${name}`,
      sourceKind: request.source.kind,
      name,
      version: request.source.version,
      readiness: "ready",
      assembledSurfaces,
      unsafeSideEffects: false,
    },
    events: ["runtime.build.accepted"],
  };
}
