/*
 * 文件定位：Agent 执行引擎 / basic_toolLayer / toolDependency / lspDependencyResolver。
 * 核心目的：兼容旧 LSP 依赖解析入口，并转发 runtime.dependencyPlane LSP resolver。
 * 能力要求1：按 target file/languageId 解析语言服务器依赖。
 * 能力要求2：把 LSP profile 转成 dependencyManager declaration。
 * 边界：不启动 LSP、不安装 server。
 * 对接：runtime.dependencyPlane.lspDependencyResolver。
 * 实现提示：保持 public-safe 错误形状。
 */

import {
  declarationsFromLspProfile as declarationsFromRuntimeLspProfile,
  resolveLspDependency as resolveRuntimeLspDependency,
  type LspDependencyProfile,
  type LspDependencyResolverInput,
} from "../../../runtimeImplementation/runtime.dependencyPlane/index.js";

export type { LspDependencyProfile, LspDependencyResolverInput };

export function resolveLspDependency(input: LspDependencyResolverInput = {}) {
  const result = resolveRuntimeLspDependency(input);
  if (!result.ok) return result;
  return {
    ok: true as const,
    profile: result.value.profile,
    value: result.value,
    events: result.events,
  };
}

export function declarationsFromLspProfile(profile?: LspDependencyProfile) {
  return declarationsFromRuntimeLspProfile(profile);
}
