/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencyChecker。
 * 核心目的：兼容旧依赖检查入口，规划 probe 候选并分类 provided probes。
 * 能力要求1：优先检查 Praxis managed bin，再检查 PATH。
 * 能力要求2：默认 dry-run，不执行外部 probe 或安装。
 * 边界：真实 probe/install 交给 runtime.dependencyPlane。
 * 对接：需要服务 dependencyManager、runtime.dependencyPlane 和旧测试。
 * 实现提示：保持 public-safe 错误，不暴露 host secret。
 */

import path from "node:path";
import {
  canonicalDependencyId,
  lookupDependencySource,
} from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";

export type BasicToolDependency = {
  id: string;
  kind?: string;
  versionRange?: string;
  scope?: string;
  severity?: "required" | "optional";
};

export type BasicToolDependencyProbe = {
  id: string;
  available?: boolean;
  version?: string;
  detail?: string;
};

export const basicToolDependencyCheckerDescriptor = {
  externalProbePerformed: false,
  unsafeSideEffects: false,
} as const;

function executableName(id: string): string {
  const canonical = canonicalDependencyId(id);
  const source = lookupDependencySource(canonical);
  if (source.ok && source.value.executableName !== undefined) return source.value.executableName;
  return canonical.split(".").at(-1) ?? canonical;
}

export function planBasicToolDependencyProbe(
  dependency: BasicToolDependency,
  input: { managedRoot?: string } = {},
) {
  const managedRoot = input.managedRoot ?? ".rax_workspace/tool-deps";
  const executable = executableName(dependency.id);
  return {
    dependencyId: dependency.id,
    externalProbePerformed: false,
    unsafeSideEffects: false,
    candidates: [
      { location: "praxis-managed", command: path.join(managedRoot, "bin", executable) },
      { location: "path", command: executable },
    ],
  };
}

export function checkBasicToolDependencies(input: {
  context?: { runtimeId?: string; toolId?: string; allowedScopes?: readonly string[]; dryRun?: boolean; metadata?: Readonly<Record<string, unknown>> };
  dependencies?: readonly BasicToolDependency[];
  probes?: readonly BasicToolDependencyProbe[];
}) {
  const runtimeId = input.context?.runtimeId?.trim();
  const toolId = input.context?.toolId?.trim();
  if (runtimeId === undefined || runtimeId.length === 0) {
    return { ok: false as const, error: { code: "MISSING_RUNTIME_ID", boundary: "input" as const, publicSafe: true }, events: ["toolDependency.check.rejected"] };
  }
  if (toolId === undefined || toolId.length === 0) {
    return { ok: false as const, error: { code: "MISSING_TOOL_ID", boundary: "input" as const, publicSafe: true }, events: ["toolDependency.check.rejected"] };
  }
  if (input.context?.dryRun === false) {
    return { ok: false as const, error: { code: "REFRESH_PROBE_BLOCKED", boundary: "contract" as const, publicSafe: true }, events: ["toolDependency.check.rejected"] };
  }
  const allowedScopes = new Set(input.context?.allowedScopes ?? []);
  for (const dependency of input.dependencies ?? []) {
    if (dependency.scope !== undefined && allowedScopes.size > 0 && !allowedScopes.has(dependency.scope)) {
      return { ok: false as const, error: { code: "SCOPE_DENIED", boundary: "scope" as const, publicSafe: true }, events: ["toolDependency.check.rejected"] };
    }
  }
  const probes = new Map((input.probes ?? []).map((probe) => [canonicalDependencyId(probe.id), probe]));
  const missingRequired = (input.dependencies ?? [])
    .filter((dependency) => dependency.severity !== "optional" && probes.get(canonicalDependencyId(dependency.id))?.available !== true)
    .map((dependency) => dependency.id);
  const optionalMissing = (input.dependencies ?? [])
    .filter((dependency) => dependency.severity === "optional" && probes.get(canonicalDependencyId(dependency.id))?.available !== true)
    .map((dependency) => dependency.id);
  const report = {
    runtimeId,
    toolId,
    status: missingRequired.length > 0 ? "blocked" : "satisfied",
    missingRequired,
    optionalMissing,
    externalProbePerformed: false,
    dryRun: true,
    unsafeSideEffects: false,
  };
  if (missingRequired.length > 0) {
    return {
      ok: false as const,
      error: { code: "DEPENDENCY_UNAVAILABLE", boundary: "dependency" as const, publicSafe: true },
      report,
      events: ["toolDependency.check.blocked"],
    };
  }
  return { ok: true as const, report, events: ["toolDependency.check.satisfied"] };
}
