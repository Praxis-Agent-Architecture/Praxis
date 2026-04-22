/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 agent Invocation Entrypoint 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createInvocationEnvelope,
  type InvocationEnvelope,
  type InvocationEnvelopeError,
  type InvocationEnvelopeGate,
  type InvocationEnvelopeSource,
  type InvocationEnvelopeTrace,
} from "./invocationEnvelope.js";

export type AgentInvocationEntrypointRequest = {
  runtimeId: string;
  agentId: string;
  source: InvocationEnvelopeSource;
  input?: unknown;
  runtimeReady?: boolean;
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: InvocationEnvelopeGate;
  governance?: InvocationEnvelopeGate;
  trace?: InvocationEnvelopeTrace;
};

export type AgentInvocationPlan = {
  invocationType: "agent";
  runtimeId: string;
  agentId: string;
  envelope: InvocationEnvelope;
  dispatch: "dry-run";
  touchesExecutionEngine: false;
};

export type AgentInvocationEntrypointResult =
  | {
      ok: true;
      plan: AgentInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationEnvelopeError;
      events: readonly string[];
    };

export function createAgentInvocationEntrypoint(
  request: AgentInvocationEntrypointRequest,
): AgentInvocationEntrypointResult {
  const envelopeResult = createInvocationEnvelope({
    runtimeId: request.runtimeId,
    targetId: request.agentId,
    invocationKind: "agent",
    source: request.source,
    payload: request.input,
    runtimeReady: request.runtimeReady,
    requestedScopes: request.requestedScopes,
    allowedScopes: request.allowedScopes,
    contract: request.contract,
    governance: request.governance,
    trace: request.trace,
  });

  if (!envelopeResult.ok) {
    return envelopeResult;
  }

  return {
    ok: true,
    plan: {
      invocationType: "agent",
      runtimeId: envelopeResult.envelope.runtimeId,
      agentId: envelopeResult.envelope.targetId,
      envelope: envelopeResult.envelope,
      dispatch: "dry-run",
      touchesExecutionEngine: false,
    },
    events: ["runtime.invocation.agent.planned", ...envelopeResult.events],
  };
}
