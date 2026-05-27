/*
 * 文件定位：Raxode package library entry.
 * 核心目的：暴露应用后端与共享协议；用户命令入口由 bin/raxode 的 TUI 路径负责。
 */

export {
  RAXODE_BACKEND_MODULE_IDS,
  raxodeApplication,
} from "./backend/application/raxodeApplication.js";
export type {
  RaxodeApplicationDescriptor,
} from "./backend/application/raxodeApplication.js";
export {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "./backend/raxodeBackend.js";
export {
  startDirectApplicationBackend,
} from "./backend/directApplicationBackend.js";
export {
  createRaxodeReadinessEvent,
  inspectRaxodeBackendReadiness,
  inspectRaxodeBackendReadinessWithLocalProbe,
} from "./backend/application/runtimeReadiness.js";
export {
  createRaxodeBackendModuleInventory,
} from "./backend/application/backendModuleInventory.js";
export {
  probeLocalRaxodeReadiness,
} from "./backend/application/localReadinessProbe.js";
export type {
  RaxodeBackendReadiness,
  RaxodeReadinessArea,
  RaxodeReadinessOwner,
  RaxodeReadinessPhase,
  RaxodeReadinessSeverity,
  RaxodeReadinessStatus,
} from "./backend/application/runtimeReadiness.js";
export type {
  RaxodeBackendModuleId,
  RaxodeBackendModuleInventory,
  RaxodeBackendModuleInventoryItem,
  RaxodeBackendModuleStatus,
} from "./backend/application/backendModuleInventory.js";
export type {
  RaxodeDependencyProbe,
  RaxodeDependencyProbeStatus,
  RaxodeLocalReadinessProbe,
  RaxodeLocalReadinessProbeInput,
  RaxodeSandboxProbe,
  RaxodeSandboxProbeStatus,
} from "./backend/application/localReadinessProbe.js";
export type {
  RaxodeApplicationAttachment,
  RaxodeApplicationBackendResult,
  RaxodeApplicationCommand,
  RaxodeApplicationEvent,
  RaxodeApplicationInputEnvelope,
  RaxodeApplicationPermissionProfile,
  RaxodeApplicationReasoningEffort,
  RaxodeApplicationRunMode,
  RaxodeApplicationStatus,
  RaxodeApplicationViewModel,
} from "./contracts.js";
