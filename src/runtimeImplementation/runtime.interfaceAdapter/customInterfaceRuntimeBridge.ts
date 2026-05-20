/*
 * 文件定位：Agent 运行态实现层 / 接口适配运行态绑定面。
 * 核心目的：承载 custom Interface Runtime Bridge 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  InterfaceAdapterRuntimeCaller,
  InterfaceAdapterRuntimeGate,
} from "./interfaceAdapterRuntime.js";

export type CustomInterfaceRuntimeBridgeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "bridge";

export type CustomInterfaceRuntimeBridgeChannel =
  | "definition"
  | "rule"
  | "invocation"
  | "inspection"
  | (string & {});

export type CustomInterfaceRuntimeBridgeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_BRIDGE_ID"
  | "MISSING_CUSTOM_INTERFACE_ID"
  | "EMPTY_BRIDGE_CHANNELS"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "CHANNEL_UNAVAILABLE";

export type CustomInterfaceRuntimeBridgeError = {
  code: CustomInterfaceRuntimeBridgeErrorCode;
  message: string;
  boundary: CustomInterfaceRuntimeBridgeBoundary;
  publicSafe: true;
};

export type CustomInterfaceBridgeChannelRef = {
  channel: CustomInterfaceRuntimeBridgeChannel;
  target: string;
};

export type CustomInterfaceRuntimeBridgeRequest = {
  runtimeId?: string;
  caller?: InterfaceAdapterRuntimeCaller;
  bridgeId?: string;
  customInterfaceId?: string;
  channels?: readonly CustomInterfaceBridgeChannelRef[];
  channelAvailability?: Partial<Record<CustomInterfaceRuntimeBridgeChannel, boolean>>;
  runtimeReady?: boolean;
  contract?: InterfaceAdapterRuntimeGate;
  governance?: InterfaceAdapterRuntimeGate;
  traceId?: string;
};

export type CustomInterfaceRuntimeBridgePlan = {
  bridgeId: string;
  runtimeId: string;
  customInterfaceId: string;
  caller: InterfaceAdapterRuntimeCaller;
  route: "runtime.interfaceAdapter.customInterfaceRuntimeBridge";
  channels: readonly CustomInterfaceBridgeChannelRef[];
  channelNames: readonly CustomInterfaceRuntimeBridgeChannel[];
  traceId?: string;
  dispatch: "dry-run";
  mockableEnvelope: true;
  contractChecked: true;
  governanceChecked: true;
  unsafeSideEffects: false;
};

export type CustomInterfaceRuntimeBridgeResult =
  | {
      ok: true;
      plan: CustomInterfaceRuntimeBridgePlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceRuntimeBridgeError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: InterfaceAdapterRuntimeCaller): InterfaceAdapterRuntimeCaller {
  const normalized: InterfaceAdapterRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function normalizeChannels(
  channels: readonly CustomInterfaceBridgeChannelRef[] | undefined,
): readonly CustomInterfaceBridgeChannelRef[] {
  return (channels ?? [])
    .map((channel) => ({
      channel: channel.channel.trim(),
      target: channel.target.trim(),
    }))
    .filter((channel) => channel.channel.length > 0 && channel.target.length > 0);
}

function failure(
  code: CustomInterfaceRuntimeBridgeErrorCode,
  message: string,
  boundary: CustomInterfaceRuntimeBridgeBoundary,
): CustomInterfaceRuntimeBridgeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.interfaceAdapter.customInterfaceRuntimeBridge.rejected"],
  };
}

function unavailableChannel(
  channels: readonly CustomInterfaceBridgeChannelRef[],
  availability: Partial<Record<CustomInterfaceRuntimeBridgeChannel, boolean>> | undefined,
): CustomInterfaceRuntimeBridgeChannel | undefined {
  return channels.find((channel) => availability?.[channel.channel] === false)?.channel;
}

export function createCustomInterfaceRuntimeBridge(
  request?: CustomInterfaceRuntimeBridgeRequest,
): CustomInterfaceRuntimeBridgeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "customInterfaceRuntimeBridge requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "customInterfaceRuntimeBridge requires a caller", "input");
  }

  if (!hasText(request.bridgeId)) {
    return failure("MISSING_BRIDGE_ID", "customInterfaceRuntimeBridge requires a bridgeId", "input");
  }

  if (!hasText(request.customInterfaceId)) {
    return failure(
      "MISSING_CUSTOM_INTERFACE_ID",
      "customInterfaceRuntimeBridge requires a customInterfaceId",
      "input",
    );
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "customInterfaceRuntimeBridge can only plan against a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "customInterfaceRuntimeBridge was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "customInterfaceRuntimeBridge was rejected by governance",
      "governance",
    );
  }

  const channels = normalizeChannels(request.channels);
  if (channels.length === 0) {
    return failure(
      "EMPTY_BRIDGE_CHANNELS",
      "customInterfaceRuntimeBridge requires at least one runtime-mediated channel",
      "bridge",
    );
  }

  const unavailable = unavailableChannel(channels, request.channelAvailability);
  if (unavailable !== undefined) {
    return failure(
      "CHANNEL_UNAVAILABLE",
      `customInterfaceRuntimeBridge channel is unavailable: ${unavailable}`,
      "runtime-state",
    );
  }

  return {
    ok: true,
    plan: {
      bridgeId: request.bridgeId.trim(),
      runtimeId: request.runtimeId.trim(),
      customInterfaceId: request.customInterfaceId.trim(),
      caller: normalizeCaller(request.caller),
      route: "runtime.interfaceAdapter.customInterfaceRuntimeBridge",
      channels,
      channelNames: [...new Set(channels.map((channel) => channel.channel))],
      traceId: request.traceId?.trim() || undefined,
      dispatch: "dry-run",
      mockableEnvelope: true,
      contractChecked: true,
      governanceChecked: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.interfaceAdapter.customInterfaceRuntimeBridge.planned"],
  };
}
