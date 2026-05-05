/*
 * 文件定位：Agent 模型适配层 / 鉴权画像层 / Auth Probe。
 * 核心目的：用 public-safe 方式报告 credentialRef 当前是否可解析。
 * 能力要求1：返回 present、credentialRef、redactedIdentity 和 header/query plan 数量。
 * 能力要求2：不返回 raw token、refresh token、Authorization header 或私有 material。
 * 能力要求3：为 providerProbe 和上层 harness 的登录态检查提供稳定状态。
 * 边界：不直接调用 provider 网络，不做能力探测。
 * 对接：调用 authResolver，并把结果压缩成 inspect-safe probe。
 * 实现提示：失败也要给 guidance 级错误码，不暴露 source 原始内容。
 */

import { resolveAuthEnvelope, type AuthResolverRequest } from "./authResolver.js";

export type AuthProbeResult = {
  ok: boolean;
  status: "available" | "missing" | "rejected";
  credentialRefId?: string;
  credentialType?: string;
  redactedIdentity?: string;
  headerPlanCount: number;
  queryPlanCount: number;
  errorCode?: string;
  publicSafe: true;
  events: readonly string[];
};

export function probeAuth(request: AuthResolverRequest = {}): AuthProbeResult {
  const resolved = resolveAuthEnvelope(request);
  const envelope = resolved.resolved.envelope;
  return {
    ok: resolved.ok && envelope.present,
    status: resolved.ok && envelope.present ? "available" : resolved.ok ? "missing" : "rejected",
    credentialRefId: envelope.credentialRef?.id,
    credentialType: envelope.credentialRef?.credentialType,
    redactedIdentity: envelope.redactedIdentity,
    headerPlanCount: envelope.headerPlan.length,
    queryPlanCount: envelope.queryPlan.length,
    errorCode: resolved.ok ? undefined : resolved.error.code,
    publicSafe: true,
    events: ["agentCore.modelAdapter.authProfile.authProbe.completed"],
  };
}
