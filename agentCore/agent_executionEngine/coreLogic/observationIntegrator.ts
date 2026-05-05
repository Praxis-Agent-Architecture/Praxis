/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：把工具和临时过程执行结果整理成 PromptPack 可消费的 observation material。
 * 边界：只做观测摘要和引用，不重放工具语义，不写 TAP/CMP/MP/multiagent 策略。
 * 对接：连接 BaseTool/Procedure 执行结果、PromptPack assembly 和下一轮 mainLoop。
 * 实现提示：保持 provider-neutral material，不在这里生成 provider payload 或最终输出。
 */

import type { PromptPackMaterialDraft } from "../promptPack/promptDefiner.js";

export type RuntimeObservationInput = {
  observationId: string;
  source: "baseTool" | "ephemeralProcedure" | "runtime" | "model";
  status: "completed" | "failed" | "waitingApproval" | "interrupted";
  title: string;
  summary: string;
  refs?: readonly string[];
  payload?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean | object>>;
};

export type RuntimeObservationMaterial = {
  observationId: string;
  material: PromptPackMaterialDraft;
  refs: readonly string[];
  payload: unknown;
};

function safeStringify(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable observation payload]";
  }
}

export function createObservationMaterial(input: RuntimeObservationInput): RuntimeObservationMaterial {
  const payloadText = safeStringify(input.payload);
  const text = [
    `${input.title}: ${input.summary}`,
    payloadText.length > 0 ? `payload: ${payloadText}` : "",
  ].filter(Boolean).join("\n");

  return {
    observationId: input.observationId,
    refs: input.refs ?? [],
    payload: input.payload,
    material: {
      id: input.observationId,
      kind: input.source === "baseTool" || input.source === "ephemeralProcedure" ? "tool-summary" : "runtime",
      text,
      source: `runtime.observation.${input.source}`,
      priority: input.status === "failed" ? 80 : 40,
      trusted: true,
      scope: "runtime.observation",
      metadata: {
        observationId: input.observationId,
        observationSource: input.source,
        observationStatus: input.status,
        ...(input.metadata ?? {}),
      },
    },
  };
}
