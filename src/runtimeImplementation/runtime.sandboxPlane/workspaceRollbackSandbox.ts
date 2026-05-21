/*
 * 文件定位：Agent 运行态实现层 / workspace rollback 沙箱基础设施。
 * 核心目的：为 yolo/降级强隔离提供跨平台 workspace-diff 回滚计划和审计对象。
 * 边界：本文件先提供稳定计划与 public-safe 元数据；实际文件执行仍由 BaseToolExecutorPort 完成。
 */

import path from "node:path";

export type WorkspaceRollbackSandboxPlan = {
  kind: "runtime.sandboxPlane.workspaceRollback.plan";
  workspaceRoot: string;
  rollbackRoot: string;
  invocationId: string;
  strategy: "workspace-diff";
  protects: readonly ["workspace-files"];
  doesNotProtect: readonly string[];
  autoMergeOnSuccess: true;
  publicSafe: true;
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "_").slice(0, 96) || "invocation";
}

export function createWorkspaceRollbackSandboxPlan(input: {
  workspaceRoot: string;
  sandboxRoot?: string;
  sessionId: string;
  invocationId: string;
}): WorkspaceRollbackSandboxPlan {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const rollbackRoot = path.resolve(
    input.sandboxRoot ?? path.join(workspaceRoot, ".rax_workspace", "sandbox", "workspace-rollback"),
    safeSegment(input.sessionId),
    safeSegment(input.invocationId),
  );
  return {
    kind: "runtime.sandboxPlane.workspaceRollback.plan",
    workspaceRoot,
    rollbackRoot,
    invocationId: input.invocationId,
    strategy: "workspace-diff",
    protects: ["workspace-files"],
    doesNotProtect: ["home directory", "system paths", "global package caches", "external services"],
    autoMergeOnSuccess: true,
    publicSafe: true,
  };
}

export const workspaceRollbackSandboxDescriptor = {
  surface: "runtime.sandboxPlane.workspaceRollbackSandbox",
  crossPlatform: true,
  protects: ["workspace-files"],
  unsafeSideEffects: false,
} as const;
