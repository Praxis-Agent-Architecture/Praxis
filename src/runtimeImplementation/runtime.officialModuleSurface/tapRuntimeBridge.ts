/*
 * 文件定位：Agent 运行态实现层 / 官方模块承托面。
 * 核心目的：为 TAP 桥接 runtime 的工具、审批、治理和执行通道。
 * 能力要求1：TAP 可以在 baseTools 之上构建更高级的工具能力库。
 * 能力要求2：本文件要让 TAP 能正式使用 agentCore，而不是替代基础工具原语层。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createModuleGovernanceBridge,
  type ModuleGovernanceBridgeRequest,
  type ModuleGovernanceBridgePlan,
} from "../runtime.governancePlane/moduleGovernanceBridge.js";

export type TapRuntimeBridgeBoundary = "input" | "contract" | "governance" | "runtime-state" | "scope";

export type TapRuntimeBridgeChannel = "tool" | "approval" | "execution";

export type TapRuntimeBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_TAP_MODULE_ID"
  | "MISSING_TOOL_ACTION"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_BRIDGE_FAILED"
  | "GOVERNANCE_DENIED"
  | "CHANNEL_UNAVAILABLE";

export type TapRuntimeBridgeChannelAvailability = Partial<Record<TapRuntimeBridgeChannel, boolean>>;

export type TapRuntimeBridgeRequest = {
  runtimeId?: string;
  tapModuleId?: string;
  toolAction?: string;
  toolName?: string;
  requestedScopes?: readonly string[];
  allowedModuleScopes?: readonly string[];
  rules?: ModuleGovernanceBridgeRequest["rules"];
  runtimeReady?: boolean;
  contract?: ModuleGovernanceBridgeRequest["contract"];
  channelAvailability?: TapRuntimeBridgeChannelAvailability;
  traceId?: string;
};

export type TapRuntimeBridgeChannelPlan = {
  channel: TapRuntimeBridgeChannel;
  ready: true;
  dispatch: "dry-run";
};

export type TapRuntimeBridgePlan = {
  runtimeId: string;
  tapModuleId: string;
  moduleKind: "TAP";
  toolAction: string;
  toolName?: string;
  traceId?: string;
  governance: ModuleGovernanceBridgePlan["decision"];
  approvalRequired: boolean;
  channelPlan: readonly TapRuntimeBridgeChannelPlan[];
  outcome: "ready" | "awaiting-approval";
  dispatch: "dry-run";
  mockableEnvelope: true;
  tapStrategyImplemented: false;
  unsafeSideEffects: false;
};

export type TapRuntimeBridgeError = {
  code: TapRuntimeBridgeErrorCode;
  message: string;
  boundary: TapRuntimeBridgeBoundary;
  publicSafe: true;
};

export type TapRuntimeBridgeResult =
  | {
      ok: true;
      plan: TapRuntimeBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: TapRuntimeBridgeError;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: TapRuntimeBridgeErrorCode,
  message: string,
  boundary: TapRuntimeBridgeBoundary,
  events: readonly string[] = ["runtime.officialModule.tapBridge.rejected"],
): TapRuntimeBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events,
  };
}

function requiredChannels(approvalRequired: boolean): readonly TapRuntimeBridgeChannel[] {
  return approvalRequired ? ["tool", "approval", "execution"] : ["tool", "execution"];
}

function assertChannelsReady(
  channels: readonly TapRuntimeBridgeChannel[],
  availability: TapRuntimeBridgeChannelAvailability | undefined,
): TapRuntimeBridgeResult | undefined {
  const unavailable = channels.find((channel) => availability?.[channel] === false);

  if (unavailable === undefined) {
    return undefined;
  }

  return failure(
    "CHANNEL_UNAVAILABLE",
    `TAP runtime bridge channel is unavailable: ${unavailable}`,
    "runtime-state",
  );
}

export function createTapRuntimeBridge(request?: TapRuntimeBridgeRequest): TapRuntimeBridgeResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "TAP runtime bridge requires a runtimeId", "input");
  }

  if (isBlank(request.tapModuleId)) {
    return failure("MISSING_TAP_MODULE_ID", "TAP runtime bridge requires a TAP module id", "input");
  }

  if (isBlank(request.toolAction)) {
    return failure("MISSING_TOOL_ACTION", "TAP runtime bridge requires a tool action", "input");
  }

  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "TAP runtime bridge can only plan against a ready runtime", "runtime-state");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "TAP runtime bridge was rejected by contract surface",
      "contract",
    );
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const tapModuleId = (request.tapModuleId ?? "").trim();
  const toolAction = (request.toolAction ?? "").trim();
  const governance = createModuleGovernanceBridge({
    runtimeId,
    moduleId: tapModuleId,
    moduleKind: "TAP",
    action: toolAction,
    allowedModuleScopes: request.allowedModuleScopes,
    requestedScopes: request.requestedScopes,
    rules: request.rules,
    runtimeReady: request.runtimeReady,
    contract: request.contract,
  });

  if (!governance.ok) {
    return failure("GOVERNANCE_BRIDGE_FAILED", governance.error.message, governance.error.boundary, [
      "runtime.officialModule.tapBridge.rejected",
      ...governance.events,
    ]);
  }

  if (governance.plan.permissionState === "deny") {
    return failure("GOVERNANCE_DENIED", governance.plan.decision.reason, "governance", [
      "runtime.officialModule.tapBridge.denied",
      ...governance.events,
    ]);
  }

  const channels = requiredChannels(governance.plan.decision.approvalRequired);
  const channelError = assertChannelsReady(channels, request.channelAvailability);

  if (channelError !== undefined) {
    return channelError;
  }

  return {
    ok: true,
    plan: {
      runtimeId,
      tapModuleId,
      moduleKind: "TAP",
      toolAction,
      toolName: request.toolName?.trim() || undefined,
      traceId: request.traceId?.trim() || undefined,
      governance: governance.plan.decision,
      approvalRequired: governance.plan.decision.approvalRequired,
      channelPlan: channels.map((channel) => ({ channel, ready: true, dispatch: "dry-run" })),
      outcome: governance.plan.decision.approvalRequired ? "awaiting-approval" : "ready",
      dispatch: "dry-run",
      mockableEnvelope: true,
      tapStrategyImplemented: false,
      unsafeSideEffects: false,
    },
    events: [
      "runtime.officialModule.tapBridge.planned",
      ...governance.events,
    ],
  };
}
