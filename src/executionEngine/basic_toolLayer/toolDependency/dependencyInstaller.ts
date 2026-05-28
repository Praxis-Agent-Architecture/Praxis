/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / dependencyInstaller。
 * 核心目的：兼容旧 ensureDependencyAvailable API，并委托 runtime.dependencyPlane trusted managed installer。
 * 能力要求1：只安装 trusted-managed source。
 * 能力要求2：安装后写 managed state。
 * 边界：系统级依赖不静默安装，自定义 recipe 默认需要审批。
 * 对接：runtime.dependencyPlane.dependencyInstaller。
 * 实现提示：旧返回形状为 ok/availability，内部使用新版 dependency id。
 */

import {
  ensureDependencyAvailable as ensureRuntimeDependencyAvailable,
  type DependencySource,
} from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";

export async function ensureDependencyAvailable(input: {
  dependencyId: string;
  allowInstall?: boolean;
  managedRoot?: string;
  source?: DependencySource;
}) {
  const result = await ensureRuntimeDependencyAvailable({
    dependencyId: input.dependencyId,
    source: input.source,
    context: {
      managedRoot: input.managedRoot,
    },
    allowInstall: input.allowInstall ?? true,
  });
  if (!result.ok) {
    return { ok: false as const, error: result.error, events: result.events };
  }
  return { ok: true as const, availability: result.value, events: result.events };
}
