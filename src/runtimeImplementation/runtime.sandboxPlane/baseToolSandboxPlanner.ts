/*
 * 文件定位：Agent 运行态实现层 / BaseTool 沙箱计划。
 * 核心目的：把工具 effect、policy profile 和当前 sandbox provider 状态合成为 per-tool 沙箱执行计划。
 * 边界：只规划沙箱强度和降级，不真正执行工具或回滚。
 */

import type { BaseToolEffectKind, BaseToolSandboxHint } from "../../basetool/factMatrix.js";
import type { BaseToolPolicyProfile, SandboxSpec } from "../runtimeAgentManifest.js";
import type { SandboxRuntimePrepareResult } from "./sandboxRuntimeProvider.js";

export type BaseToolSandboxMode = "none" | "workspace-rollback" | "isolated";
export type BaseToolSandboxPlanStatus = "ready" | "degraded" | "not-required";

export type BaseToolSandboxPlan = {
  kind: "runtime.sandboxPlane.baseTool.sandboxPlan";
  toolId: string;
  profile: BaseToolPolicyProfile;
  requestedMode: BaseToolSandboxMode;
  effectiveMode: BaseToolSandboxMode;
  status: BaseToolSandboxPlanStatus;
  sandboxId: string;
  providerFamily?: SandboxSpec["providerFamily"];
  sandboxReady: boolean;
  degradeReason?: string;
  requiredCapabilities: {
    filesystem: "none" | "read" | "write";
    network: "none" | "egress";
    process: "none" | "spawn" | "control";
    userInteraction: boolean;
    externalAdapter: boolean;
  };
  rollback: {
    required: boolean;
    strategy: "none" | "workspace-diff";
    protects: readonly ["workspace-files"] | readonly [];
    doesNotProtect: readonly string[];
    autoMergeOnSuccess: boolean;
  };
  publicSafe: true;
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

function requestedModeFor(profile: BaseToolPolicyProfile): BaseToolSandboxMode {
  if (profile === "bapr") return "none";
  if (profile === "yolo") return "workspace-rollback";
  return "isolated";
}

function capabilitiesFromHint(hint: BaseToolSandboxHint | undefined): BaseToolSandboxPlan["requiredCapabilities"] {
  return {
    filesystem: hint?.filesystem ?? "none",
    network: hint?.network ?? "none",
    process: hint?.process ?? "none",
    userInteraction: hint?.userInteraction === true,
    externalAdapter: hint?.externalAdapter === true,
  };
}

function sandboxIsStrong(spec: SandboxSpec, prepared?: SandboxRuntimePrepareResult): boolean {
  const family = prepared?.providerFamily ?? spec.providerFamily ?? spec.profile;
  if (family === "linux-bubblewrap" || family === "rootless-container" || family === "windows-sandbox" || family === "macos-containerization" || family === "remote-worker") {
    return prepared?.ready === true;
  }
  return false;
}

export function planBaseToolSandbox(input: {
  toolId: string;
  profile: BaseToolPolicyProfile;
  sandbox: SandboxSpec;
  preparedSandbox?: SandboxRuntimePrepareResult;
  effectKinds?: readonly BaseToolEffectKind[];
  sandboxHint?: BaseToolSandboxHint;
}): BaseToolSandboxPlan {
  const requestedMode = requestedModeFor(input.profile);
  const strongReady = sandboxIsStrong(input.sandbox, input.preparedSandbox);
  const effectiveMode: BaseToolSandboxMode = requestedMode === "isolated" && !strongReady
    ? "workspace-rollback"
    : requestedMode;
  const degraded = requestedMode !== effectiveMode;
  const rollbackRequired = effectiveMode === "workspace-rollback";
  const status: BaseToolSandboxPlanStatus = requestedMode === "none" ? "not-required" : degraded ? "degraded" : "ready";

  return {
    kind: "runtime.sandboxPlane.baseTool.sandboxPlan",
    toolId: input.toolId,
    profile: input.profile,
    requestedMode,
    effectiveMode,
    status,
    sandboxId: input.sandbox.sandboxId,
    providerFamily: input.preparedSandbox?.providerFamily ?? input.sandbox.providerFamily,
    sandboxReady: input.preparedSandbox?.ready === true,
    degradeReason: degraded
      ? input.preparedSandbox?.probe.publicSafeMessage ?? "strong sandbox provider is not ready; degraded to workspace rollback"
      : undefined,
    requiredCapabilities: capabilitiesFromHint(input.sandboxHint),
    rollback: {
      required: rollbackRequired,
      strategy: rollbackRequired ? "workspace-diff" : "none",
      protects: rollbackRequired ? ["workspace-files"] : [],
      doesNotProtect: rollbackRequired ? ["home directory", "system paths", "global package caches", "external services"] : [],
      autoMergeOnSuccess: rollbackRequired,
    },
    publicSafe: true,
    events: [
      status === "degraded"
        ? "runtime.sandboxPlane.baseToolSandbox.degraded"
        : status === "ready"
          ? "runtime.sandboxPlane.baseToolSandbox.ready"
          : "runtime.sandboxPlane.baseToolSandbox.notRequired",
    ],
    metadata: {
      effectKinds: input.effectKinds ?? [],
      sandboxHint: input.sandboxHint ?? {},
      requestedMode,
      effectiveMode,
    },
  };
}

export const baseToolSandboxPlannerDescriptor = {
  surface: "runtime.sandboxPlane.baseToolSandboxPlanner",
  modes: ["none", "workspace-rollback", "isolated"],
  fallback: "isolated -> workspace-rollback",
} as const;
