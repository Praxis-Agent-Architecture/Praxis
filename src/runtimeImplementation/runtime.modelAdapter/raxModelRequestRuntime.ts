/*
 * 文件定位：Agent 运行态实现层 / RaxModelRequest 调用桥。
 * 核心目的：把 runtime 调用模式接到新的 RaxModelClient prepare/stream/generate 请求层。
 * 边界：不选择 provider route、不解析产品配置、不实现重试策略；provider 字段形状归 src/modelAdapter。
 * 对接：上接 runtime invocation/application surface，下接 modelAdapter 的 RaxModelRequest、RaxModelClient、protocol 和 transport。
 * 实现提示：保持 prepare/stream/generate 三种模式可注入、可测试，并保留事件与 invocationId 供上层串联。
 */

import {
  defaultRaxModelClient,
  foldRaxModelEvents,
  type RaxModelClient,
  type RaxModelEvent,
  type RaxModelRequest,
  type RaxModelResponse,
  type RaxPreparedModelRequest,
} from "../../modelAdapter/index.js";

export type RaxModelRuntimeInvokeMode = "prepare" | "stream" | "generate";

export type RaxModelRuntimeRequest = {
  runtimeId?: string;
  invocationId?: string;
  request: RaxModelRequest;
  mode?: RaxModelRuntimeInvokeMode;
  client?: RaxModelClient;
};

export type RaxModelRuntimeResult =
  | {
      ok: true;
      runtimeId?: string;
      invocationId: string;
      prepared?: RaxPreparedModelRequest;
      events: RaxModelEvent[];
      response?: RaxModelResponse;
    }
  | {
      ok: false;
      runtimeId?: string;
      invocationId?: string;
      error: {
        code: string;
        message: string;
      };
      events: RaxModelEvent[];
    };

export async function invokeRaxModelThroughRuntime(input: RaxModelRuntimeRequest): Promise<RaxModelRuntimeResult> {
  const client = input.client ?? defaultRaxModelClient;
  const invocationId = input.invocationId ?? input.request.id ?? `${input.runtimeId ?? "runtime"}:model:${Date.now()}`;

  try {
    if (input.mode === "prepare") {
      const prepared = await client.prepare({ ...input.request, id: invocationId });
      return { ok: true, runtimeId: input.runtimeId, invocationId, prepared, events: [] };
    }

    const events: RaxModelEvent[] = [];
    for await (const event of client.stream({ ...input.request, id: invocationId })) {
      events.push(event);
    }

    return {
      ok: true,
      runtimeId: input.runtimeId,
      invocationId,
      events,
      response: input.mode === "stream" ? undefined : foldRaxModelEvents(events),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "model_runtime_error";
    return { ok: false, runtimeId: input.runtimeId, invocationId, error: { code, message }, events: [] };
  }
}
