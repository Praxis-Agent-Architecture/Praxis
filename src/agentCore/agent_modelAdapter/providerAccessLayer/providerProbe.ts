/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / Provider Probe。
 * 核心目的：用 carrier + auth probe 组合出 provider 接入可用性状态。
 * 能力要求1：返回 provider、endpointShape、capabilities、credential 状态和 cachePolicy。
 * 能力要求2：probe 不泄漏 secret，不默认调用上游网络。
 * 能力要求3：为后续经济控制、缓存策略和 live smoke gating 提供统一状态。
 * 边界：不执行模型调用，不做 PromptPack lowering。
 * 对接：被上层 harness、live smoke 和 runtime inspection 使用。
 * 实现提示：第一版只做静态/鉴权 probe；后续可加入显式 network probe。
 */

import type { AuthProbeResult } from "../authProfileLayer/authProbe.js";
import type { ProviderCarrier } from "./providerCarrier.js";

export type ProviderProbeResult = {
  ok: boolean;
  provider: string;
  carrierId: string;
  endpointShape: string;
  status: "ready" | "auth-missing" | "carrier-only";
  model?: string;
  capabilities: readonly string[];
  cachePolicy: ProviderCarrier["cachePolicy"];
  auth?: Omit<AuthProbeResult, "events">;
  publicSafe: true;
  events: readonly string[];
};

export function probeProviderCarrier(input: { carrier: ProviderCarrier; auth?: AuthProbeResult }): ProviderProbeResult {
  return {
    ok: input.auth === undefined ? true : input.auth.ok,
    provider: input.carrier.provider,
    carrierId: input.carrier.carrierId,
    endpointShape: input.carrier.endpointShape,
    status: input.auth === undefined ? "carrier-only" : input.auth.ok ? "ready" : "auth-missing",
    model: input.carrier.model,
    capabilities: input.carrier.capabilities,
    cachePolicy: input.carrier.cachePolicy,
    auth:
      input.auth === undefined
        ? undefined
        : {
            ok: input.auth.ok,
            status: input.auth.status,
            credentialRefId: input.auth.credentialRefId,
            credentialType: input.auth.credentialType,
            redactedIdentity: input.auth.redactedIdentity,
            headerPlanCount: input.auth.headerPlanCount,
            queryPlanCount: input.auth.queryPlanCount,
            errorCode: input.auth.errorCode,
            publicSafe: true,
          },
    publicSafe: true,
    events: ["agentCore.modelAdapter.providerAccess.providerProbe.completed"],
  };
}
