/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencySourceRegistry。
 * 核心目的：兼容旧依赖源查询 API，并委托 runtime.dependencyPlane 管理官方依赖源。
 * 能力要求1：保留 trusted managed install plan 行为。
 * 能力要求2：保留 detect-only 依赖不可静默安装的边界。
 * 边界：不直接安装依赖，不读取 secret。
 * 对接：runtime.dependencyPlane.dependencySourceRegistry。
 * 实现提示：旧返回形状使用 ok/value，内部使用新版点号 dependency id。
 */

import {
  defaultManagedRoot,
  lookupDependencySource as lookupRuntimeDependencySource,
  planDependencyInstallation as planRuntimeDependencyInstallation,
  dependencySourceRegistryDescriptor,
  type DependencySource,
} from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";

export { dependencySourceRegistryDescriptor };

export function managedBinDir(input: { managedRoot?: string; env?: Readonly<Record<string, string | undefined>>; homeDir?: string } = {}): string {
  return `${defaultManagedRoot({ raxToolDepsRoot: input.managedRoot, env: input.env, homeDir: input.homeDir })}/bin`;
}

export function lookupDependencySource(dependencyId: string):
  | { ok: true; source: DependencySource; events: readonly string[] }
  | { ok: false; error: { code: string; message: string; publicSafe: true }; events: readonly string[] } {
  const result = lookupRuntimeDependencySource(dependencyId);
  if (!result.ok) {
    return { ok: false, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
  }
  return { ok: true, source: result.value, events: result.events };
}

export function planDependencyInstallation(input: {
  dependencyId: string;
  managedRoot?: string;
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
}) {
  const result = planRuntimeDependencyInstallation(input);
  if (!result.ok) {
    return { ok: false as const, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
  }
  return { ok: true as const, plan: result.value, events: result.events };
}
