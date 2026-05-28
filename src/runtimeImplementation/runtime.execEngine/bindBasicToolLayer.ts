/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 bind Basic Tool Layer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createRuntimeExecEngineBinding,
  type RuntimeExecEngineBindingRequest,
  type RuntimeExecEngineBindingResult,
} from "./bindCoreLogic.js";

export type BindBasicToolLayerRequest = Omit<RuntimeExecEngineBindingRequest, "bindingKind"> & {
  toolKinds?: readonly string[];
};

export type BindBasicToolLayerResult = RuntimeExecEngineBindingResult;

export const DEFAULT_BASIC_TOOL_LAYER_BINDING_CAPABILITIES = [
  "baseToolEnvelope",
  "dryRunGuard",
  "auditTrail",
] as const;

export const DEFAULT_BASIC_TOOL_LAYER_KINDS = [
  "file",
  "patch",
  "shell",
  "process",
  "web",
  "plan",
  "user",
  "skill",
  "context",
  "mcp",
  "agent",
  "tool",
] as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function bindBasicToolLayer(request?: BindBasicToolLayerRequest): BindBasicToolLayerResult {
  const toolKinds = cleanList(request?.toolKinds);
  const capabilities = cleanList(request?.capabilities);

  return createRuntimeExecEngineBinding(
    {
      ...request,
      bindingKind: "basicToolLayer",
      capabilities:
        capabilities.length > 0
          ? capabilities
          : [
              ...DEFAULT_BASIC_TOOL_LAYER_BINDING_CAPABILITIES,
              ...(toolKinds.length > 0 ? toolKinds : DEFAULT_BASIC_TOOL_LAYER_KINDS).map(
                (toolKind) => `tool.${toolKind}`,
              ),
            ],
    },
    {
      bindingKind: "basicToolLayer",
      bindingId: "runtime.execEngine.basicToolLayer",
      capabilities: DEFAULT_BASIC_TOOL_LAYER_BINDING_CAPABILITIES,
      eventNamePrefix: "runtime.execEngine.basicToolLayer.binding",
    },
  );
}
