/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 bind Event Exposure Plane 这一能力位点。
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

export type BindEventExposurePlaneRequest = Omit<RuntimeExecEngineBindingRequest, "bindingKind"> & {
  eventChannels?: readonly string[];
};

export type BindEventExposurePlaneResult = RuntimeExecEngineBindingResult;

export const DEFAULT_EVENT_EXPOSURE_PLANE_CHANNELS = [
  "input.received",
  "output.exposed",
  "interrupt",
  "ui",
  "basicTool.invocation",
  "officialModule.invocation",
  "multiAgent.invocation",
] as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function bindEventExposurePlane(request?: BindEventExposurePlaneRequest): BindEventExposurePlaneResult {
  const eventChannels = cleanList(request?.eventChannels);
  const capabilities = cleanList(request?.capabilities);

  return createRuntimeExecEngineBinding(
    {
      ...request,
      bindingKind: "eventExposurePlane",
      capabilities:
        capabilities.length > 0
          ? capabilities
          : (eventChannels.length > 0 ? eventChannels : DEFAULT_EVENT_EXPOSURE_PLANE_CHANNELS).map(
              (channel) => `event.${channel}`,
            ),
    },
    {
      bindingKind: "eventExposurePlane",
      bindingId: "runtime.execEngine.eventExposurePlane",
      capabilities: DEFAULT_EVENT_EXPOSURE_PLANE_CHANNELS.map((channel) => `event.${channel}`),
      eventNamePrefix: "runtime.execEngine.eventExposurePlane.binding",
    },
  );
}
