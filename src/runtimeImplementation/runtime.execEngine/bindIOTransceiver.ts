/*
 * 文件定位：Agent 运行态实现层 / 执行引擎运行态绑定面。
 * 核心目的：承载 bind IOTransceiver 这一能力位点。
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

export type BindIOTransceiverRequest = Omit<RuntimeExecEngineBindingRequest, "bindingKind"> & {
  ioChannels?: readonly string[];
};

export type BindIOTransceiverResult = RuntimeExecEngineBindingResult;

export const DEFAULT_IO_TRANSCEIVER_BINDING_CAPABILITIES = [
  "inputReceiver",
  "outputExposer",
] as const;

export const DEFAULT_IO_TRANSCEIVER_CHANNELS = [
  "text",
  "image",
  "audio",
  "video",
] as const;

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

export function bindIOTransceiver(request?: BindIOTransceiverRequest): BindIOTransceiverResult {
  const ioChannels = cleanList(request?.ioChannels);
  const capabilities = cleanList(request?.capabilities);

  return createRuntimeExecEngineBinding(
    {
      ...request,
      bindingKind: "ioTransceiver",
      capabilities:
        capabilities.length > 0
          ? capabilities
          : [
              ...DEFAULT_IO_TRANSCEIVER_BINDING_CAPABILITIES,
              ...(ioChannels.length > 0 ? ioChannels : DEFAULT_IO_TRANSCEIVER_CHANNELS).map(
                (channel) => `io.${channel}`,
              ),
            ],
    },
    {
      bindingKind: "ioTransceiver",
      bindingId: "runtime.execEngine.ioTransceiver",
      capabilities: DEFAULT_IO_TRANSCEIVER_BINDING_CAPABILITIES,
      eventNamePrefix: "runtime.execEngine.ioTransceiver.binding",
    },
  );
}
