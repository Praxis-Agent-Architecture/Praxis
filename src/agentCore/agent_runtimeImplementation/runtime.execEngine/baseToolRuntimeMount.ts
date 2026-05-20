/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：把 baseTool registry、tool invocation envelope 和 BaseToolExecutorPort 串成统一运行时挂载点。
 * 能力要求1：需要让所有内置 baseTool 通过同一条 runtime 链路进入 handler.invoke。
 * 能力要求2：如果后续发现语义不足，应优先补 runtime port 契约，而不是给单个工具写散落 wrapper。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  BaseToolFamily,
  BaseToolInvokeResult,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import {
  BaseToolRegistry,
  createBaseToolRegistry,
} from "../../agent_executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  adaptRuntimeToolInvocation,
  type BasicToolAdapterFamily,
} from "../../agent_executionEngine/basic_toolLayer/invocationAdapter.js";
import {
  bridgeExecEngineInvocation,
} from "./execEngineInvocationBridge.js";
import { baseToolExecutorPortFactoryDescriptor } from "./baseToolExecutorPortFactory.js";
import {
  evaluateBaseToolRuntimeReadiness,
  type BaseToolRuntimeReadinessPreflight,
  type BaseToolRuntimeSupportStatus,
} from "./baseToolSupportCatalog.js";
import type {
  ExecEngineRuntimeCaller,
  ExecEngineRuntimeGate,
} from "./execEngineRuntime.js";

export type BaseToolRuntimeMountBoundary =
  | "input"
  | "contract"
  | "governance"
  | "scope"
  | "runtime-state"
  | "registry"
  | "bridge"
  | "handler";

export type BaseToolRuntimeMountErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_SESSION_ID"
  | "MISSING_TOOL_ID"
  | "MISSING_EXECUTOR"
  | "ADAPTER_REJECTED"
  | "BRIDGE_REJECTED"
  | "TOOL_NOT_FOUND"
  | "HANDLER_NOT_FOUND"
  | "RUNTIME_SUPPORT_UNAVAILABLE"
  | "HANDLER_THROWN";

export type BaseToolRuntimeMountResourceLimits = {
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type BaseToolRuntimeReadinessMode =
  | "observe"
  | "block-unavailable"
  | "require-ready";

export type BaseToolRuntimeMountRequest = {
  runtimeId?: string;
  sessionId?: string;
  toolId?: string;
  toolCallId?: string;
  operation?: string;
  input?: Readonly<Record<string, unknown>>;
  executor?: BaseToolExecutorPort;
  registry?: BaseToolRegistry;
  caller?: ExecEngineRuntimeCaller;
  runtimeReady?: boolean;
  family?: BasicToolAdapterFamily;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  resourceLimits?: BaseToolRuntimeMountResourceLimits;
  contract?: ExecEngineRuntimeGate;
  governance?: ExecEngineRuntimeGate;
  readinessMode?: BaseToolRuntimeReadinessMode;
  implementedPortPaths?: readonly string[];
  disabledSupports?: readonly string[];
  approvalRequiredSupports?: readonly string[];
  supportStatusOverrides?: Readonly<Record<string, BaseToolRuntimeSupportStatus>>;
  metadata?: Readonly<Record<string, unknown>>;
};

export type BaseToolMountedInvocation = {
  kind: "runtime.execEngine.baseTool.mountedInvocation";
  runtimeId: string;
  sessionId: string;
  toolId: string;
  toolCallId: string;
  family: BaseToolFamily;
  mountedVia: "createBaseToolRegistry.lookupHandler";
  adapterRoute: "agentCore.basicTool.invocationAdapter";
  bridgeRoute: "runtime.execEngine.invocationBridge";
  executorPort: "BaseToolExecutorPort";
  handlerDispatched: true;
  toolResultOk: boolean;
  runtimeReadiness: BaseToolRuntimeReadinessPreflight;
  unsafeSideEffects: "delegated-to-handler-and-executor-port";
};

export type BaseToolRuntimeMountError = {
  code: BaseToolRuntimeMountErrorCode;
  message: string;
  boundary: BaseToolRuntimeMountBoundary;
  publicSafe: true;
};

export type BaseToolRuntimeMountResult =
  | {
      ok: true;
      invocation: BaseToolMountedInvocation;
      toolResult: BaseToolInvokeResult;
      events: readonly string[];
    }
  | {
      ok: false;
      error: BaseToolRuntimeMountError;
      runtimeReadiness?: BaseToolRuntimeReadinessPreflight;
      events: readonly string[];
    };

export const baseToolRuntimeMountDescriptor = {
  surface: "runtime.execEngine.baseToolRuntimeMount",
  capability: "mount-baseTool-registry-handler-through-runtime-execEngine",
  chain: [
    "agentCore.basicTool.invocationAdapter",
    "runtime.execEngine.invocationBridge",
    "agentCore.basicTool.registry.lookupHandler",
    "BaseToolHandler.invoke",
    "BaseToolExecutorPort",
  ],
  registry: "agentCore.basicTool.registry",
  executorPort: "BaseToolExecutorPort",
  hostOwnsRealExecution: true,
  readinessPreflight: "runtime.execEngine.baseToolSupportCatalog",
} as const;

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultCaller(sessionId: string): ExecEngineRuntimeCaller {
  return {
    kind: "runtime-surface",
    id: "runtime.execEngine.baseToolRuntimeMount",
    sessionId,
  };
}

function defaultToolCallId(runtimeId: string, toolId: string): string {
  return `${runtimeId}:baseTool:${toolId}`;
}

function defaultScopes(toolId: string): readonly string[] {
  return ["tool.execute", `tool.${toolId}`];
}

function failure(
  code: BaseToolRuntimeMountErrorCode,
  message: string,
  boundary: BaseToolRuntimeMountBoundary,
  runtimeReadiness?: BaseToolRuntimeReadinessPreflight,
): BaseToolRuntimeMountResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    runtimeReadiness,
    events: ["runtime.execEngine.baseToolRuntimeMount.rejected"],
  };
}

function shouldRejectReadiness(
  mode: BaseToolRuntimeReadinessMode | undefined,
  readiness: BaseToolRuntimeReadinessPreflight,
): boolean {
  const effectiveMode = mode ?? "block-unavailable";
  if (effectiveMode === "observe") return false;
  if (readiness.decision === "blocked") return true;
  return effectiveMode === "require-ready" && readiness.decision !== "allowed";
}

export async function invokeMountedBaseTool(
  request: BaseToolRuntimeMountRequest = {},
): Promise<BaseToolRuntimeMountResult> {
  if (!hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "baseTool runtime mount requires runtimeId", "input");
  }

  if (!hasText(request.sessionId)) {
    return failure("MISSING_SESSION_ID", "baseTool runtime mount requires sessionId", "input");
  }

  if (!hasText(request.toolId)) {
    return failure("MISSING_TOOL_ID", "baseTool runtime mount requires toolId", "input");
  }

  if (request.executor === undefined) {
    return failure("MISSING_EXECUTOR", "baseTool runtime mount requires a BaseToolExecutorPort", "input");
  }

  const runtimeId = request.runtimeId.trim();
  const sessionId = request.sessionId.trim();
  const toolId = request.toolId.trim();
  const toolCallId = request.toolCallId?.trim() || defaultToolCallId(runtimeId, toolId);
  const input = request.input ?? {};
  const requestedScopes = request.requestedScopes ?? defaultScopes(toolId);

  const adapted = adaptRuntimeToolInvocation({
    context: {
      runtimeId,
      sessionId,
      invocationId: toolCallId,
      requestedScopes,
      allowedScopes: request.allowedScopes,
      contract: request.contract,
      governance: request.governance,
      auditMetadata: request.metadata,
    },
    toolId,
    family: request.family,
    operation: request.operation ?? toolId,
    arguments: input,
    resourceLimits: request.resourceLimits,
  });

  if (!adapted.ok) {
    return failure("ADAPTER_REJECTED", adapted.error.message, adapted.error.boundary);
  }

  const bridged = bridgeExecEngineInvocation({
    runtimeId,
    caller: request.caller ?? defaultCaller(sessionId),
    invocation: {
      invocationId: toolCallId,
      kind: "tool",
      target: toolId,
      payload: adapted.invocation,
      auditRef: adapted.invocation.audit.event,
    },
    runtimeReady: request.runtimeReady,
    contract: request.contract,
    governance: request.governance,
  });

  if (!bridged.ok) {
    return failure("BRIDGE_REJECTED", bridged.error.message, bridged.error.boundary);
  }

  const registry = request.registry ?? createBaseToolRegistry();
  const lookup = registry.lookupHandler(toolId);
  if (!lookup.ok) {
    return failure(lookup.error.code, lookup.error.message, "registry");
  }

  const runtimeReadiness = evaluateBaseToolRuntimeReadiness({
    toolId,
    executor: request.executor,
    implementedPortPaths: request.implementedPortPaths ?? baseToolExecutorPortFactoryDescriptor.implementedAdapters,
    disabledSupports: request.disabledSupports,
    approvalRequiredSupports: request.approvalRequiredSupports,
    supportStatusOverrides: request.supportStatusOverrides,
  });

  if (shouldRejectReadiness(request.readinessMode, runtimeReadiness)) {
    return failure(
      "RUNTIME_SUPPORT_UNAVAILABLE",
      runtimeReadiness.reason,
      "runtime-state",
      runtimeReadiness,
    );
  }

  try {
    const toolResult = await lookup.handler.invoke({
      toolCallId,
      runtimeId,
      sessionId,
      input,
      executor: request.executor,
      metadata: request.metadata,
    });

    return {
        ok: true,
        invocation: {
          kind: "runtime.execEngine.baseTool.mountedInvocation",
          runtimeId,
          sessionId,
          toolId,
          toolCallId,
          family: lookup.handler.definition.family,
          mountedVia: "createBaseToolRegistry.lookupHandler",
          adapterRoute: "agentCore.basicTool.invocationAdapter",
          bridgeRoute: "runtime.execEngine.invocationBridge",
          executorPort: "BaseToolExecutorPort",
          handlerDispatched: true,
          toolResultOk: toolResult.ok,
          runtimeReadiness,
          unsafeSideEffects: "delegated-to-handler-and-executor-port",
        },
        toolResult,
        events: [
          "runtime.execEngine.baseToolRuntimeMount.invoked",
          ...runtimeReadiness.events,
          ...adapted.events,
          ...bridged.events,
          ...toolResult.events,
        ],
      };
  } catch {
    return failure(
      "HANDLER_THROWN",
      "baseTool handler failed before producing a public-safe result",
      "handler",
    );
  }
}
