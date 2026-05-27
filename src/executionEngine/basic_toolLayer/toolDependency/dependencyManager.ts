/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencyManager。
 * 核心目的：兼容旧 basic tool dependency 报告入口，并转向 runtime.dependencyPlane 的声明式依赖模型。
 * 能力要求1：只做 public-safe dry-run 分类，不执行安装、不探测宿主。
 * 能力要求2：输出可供 iteration/runtime preflight 消费的依赖 resolution 报告。
 * 边界：真实安装、probe、锁文件和状态写入属于 runtime.dependencyPlane。
 * 对接：需要服务旧 tests、runtime.dependencyPlane 和 baseToolDependencyRuntime。
 * 实现提示：保持兼容字段，同时规范化新版 dependency id。
 */

import { canonicalDependencyId, type DependencyKind } from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";

export type ToolDependencyDeclaration = {
  dependencyId?: string;
  id?: string;
  kind?: DependencyKind | "package" | "mcp-server";
  required?: boolean;
  requestedVersion?: string;
  acceptedVersions?: readonly string[];
  requiredScopes?: readonly string[];
  scope?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolDependencyProbe = {
  dependencyId: string;
  id?: string;
  available?: boolean;
  blocked?: boolean;
  conflictWith?: readonly string[];
  version?: string;
  observedAt?: string;
  detail?: string;
};

export type ToolDependencyResolutionStatus = "satisfied" | "missing" | "stale" | "conflict" | "blocked" | "unknown";

export type ToolDependencyResolution = {
  dependencyId: string;
  status: ToolDependencyResolutionStatus;
  required: boolean;
  observedVersion?: string;
  requestedVersion?: string;
  detail?: string;
};

export type ToolDependencyReport = {
  toolId: string;
  status: "satisfied" | "stale" | "blocked" | "degraded" | "unknown";
  dryRun: true;
  unsafeSideEffects: false;
  summary: {
    satisfied: number;
    stale: number;
    requiredUnsatisfied: number;
  };
  resolutions: readonly ToolDependencyResolution[];
};

export type ToolDependencyManagerResult =
  | { ok: true; report: ToolDependencyReport; events: readonly string[] }
  | {
      ok: false;
      error: { code: string; message: string; boundary: "input" | "contract" | "scope"; publicSafe: true };
      events: readonly string[];
    };

export const toolDependencyManagerDescriptor = {
  surface: "agent.executionEngine.basicToolLayer.toolDependency.manager",
  defaultDryRun: true,
  delegatesTo: "runtime.dependencyPlane",
} as const;

function failure(code: string, message: string, boundary: "input" | "contract" | "scope"): ToolDependencyManagerResult {
  return { ok: false, error: { code, message, boundary, publicSafe: true }, events: ["toolDependency.manager.rejected"] };
}

function depId(input: ToolDependencyDeclaration | ToolDependencyProbe): string {
  return canonicalDependencyId((input.dependencyId ?? input.id ?? "").trim());
}

function versionStale(declaration: ToolDependencyDeclaration, probe: ToolDependencyProbe | undefined): boolean {
  if (probe?.available !== true) return false;
  if (declaration.requestedVersion !== undefined) return probe.version !== declaration.requestedVersion;
  if (declaration.acceptedVersions !== undefined) return probe.version === undefined || !declaration.acceptedVersions.includes(probe.version);
  return false;
}

export function manageToolDependencies(input?: {
  toolId?: string;
  context?: { dryRun?: boolean; allowedScopes?: readonly string[] };
  declarations?: readonly ToolDependencyDeclaration[];
  probes?: readonly ToolDependencyProbe[];
}): ToolDependencyManagerResult {
  const request = input;
  const toolId = input?.toolId?.trim();
  if (toolId === undefined || toolId.length === 0) return failure("MISSING_TOOL_ID", "dependency manager requires a toolId", "input");
  if (request?.context?.dryRun === false) return failure("REAL_DEPENDENCY_RESOLUTION_NOT_ALLOWED", "dependency manager is dry-run only", "contract");
  if (request?.declarations === undefined) return failure("MISSING_DECLARATIONS", "dependency manager requires declarations", "input");
  const ids = request.declarations.map(depId);
  if (ids.some((id) => id.length === 0)) return failure("MISSING_DEPENDENCY_ID", "dependency declarations must have dependency ids", "input");
  if (new Set(ids).size !== ids.length) return failure("DUPLICATE_DEPENDENCY_ID", "dependency declarations must have unique ids", "contract");
  const probeIds = (request.probes ?? []).map(depId);
  if (probeIds.some((id) => id.length === 0)) return failure("MISSING_DEPENDENCY_PROBE_ID", "dependency probes must have dependency ids", "input");
  const allowedScopes = new Set(request.context?.allowedScopes ?? []);
  for (const declaration of request.declarations) {
    const scopes = [...(declaration.requiredScopes ?? []), ...(declaration.scope === undefined ? [] : [declaration.scope])];
    if (scopes.some((scope) => !allowedScopes.has(scope)) && allowedScopes.size > 0) {
      return failure("SCOPE_DENIED", `dependency ${depId(declaration)} requires a denied scope`, "scope");
    }
  }
  const probes = new Map((request.probes ?? []).map((probe) => [depId(probe), probe]));
  const resolutions = request.declarations.map((declaration): ToolDependencyResolution => {
    const id = depId(declaration);
    const probe = probes.get(id);
    const required = declaration.required !== false;
    if (probe?.blocked === true) return { dependencyId: id, status: "blocked", required, observedVersion: probe.version, detail: probe.detail };
    if ((probe?.conflictWith?.length ?? 0) > 0) return { dependencyId: id, status: "conflict", required, observedVersion: probe?.version, detail: probe?.conflictWith?.join(", ") };
    if (versionStale(declaration, probe)) return { dependencyId: id, status: "stale", required, observedVersion: probe?.version, requestedVersion: declaration.requestedVersion };
    if (probe?.available === true) return { dependencyId: id, status: "satisfied", required, observedVersion: probe.version };
    return { dependencyId: id, status: "missing", required, detail: probe?.detail };
  });
  const requiredUnsatisfied = resolutions.filter((item) => item.required && item.status !== "satisfied").length;
  const stale = resolutions.filter((item) => item.status === "stale").length;
  const blocked = resolutions.some((item) => item.required && (item.status === "blocked" || item.status === "conflict" || item.status === "missing"));
  const degraded = resolutions.some((item) => !item.required && (item.status === "blocked" || item.status === "conflict" || item.status === "missing"));
  return {
    ok: true,
    report: {
      toolId,
      status: blocked ? "blocked" : stale > 0 ? "stale" : degraded ? "degraded" : resolutions.length === 0 ? "unknown" : "satisfied",
      dryRun: true,
      unsafeSideEffects: false,
      summary: {
        satisfied: resolutions.filter((item) => item.status === "satisfied").length,
        stale,
        requiredUnsatisfied,
      },
      resolutions,
    },
    events: ["toolDependency.manager.reported"],
  };
}
