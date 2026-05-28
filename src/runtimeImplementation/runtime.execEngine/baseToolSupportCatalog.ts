/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面 / semantic basetool 支持目录。
 * 核心目的：把 src/basetool 的单一事实源投影为 runtime 可检查的支持、readiness 和挂载契约目录。
 * 边界：这里只做 runtime 支持状态投影，不重新定义工具语义。
 * 对接：服务 BaseTool 挂载前置检查、reality ledger、inspection 和 application 调试面。
 * 实现提示：以 src/basetool/supportCatalog.ts 为唯一实现源，runtime.execEngine 这里只保留兼容导出。
 */

export {
  baseToolSupportCatalogDescriptor,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  snapshotBaseToolSupportCatalog,
  type BaseToolRuntimeReadinessDecision,
  type BaseToolRuntimeReadinessPreflight,
  type BaseToolRuntimeReadinessPreflightRequest,
  type BaseToolRuntimeSupportKind,
  type BaseToolRuntimeSupportRequirement,
  type BaseToolRuntimeSupportStatus,
  type BaseToolSupportCatalogEntry,
  type BaseToolSupportCatalogOptions,
  type BaseToolSupportCatalogSnapshot,
} from "../../basetool/supportCatalog.js";
