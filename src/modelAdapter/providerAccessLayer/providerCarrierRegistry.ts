/*
 * 文件定位：Agent 模型适配层 / Provider 接入层 / Provider Carrier Registry。
 * 核心目的：注册 provider carriers，并提供 agent_modelAdapter 域内的 provider 能力目录。
 * 能力要求1：保留 credentialRef、model、reasoning、cachePolicy 等完整 carrier 字段。
 * 能力要求2：做重复 id、scope 和最小字段校验。
 * 能力要求3：输出 public-safe registry，不含 raw credential。
 * 边界：不替 runtime 执行调用，不做 auth resolver。
 * 对接：runtime.modelAdapter registry 可把此域对象投影成运行态状态。
 * 实现提示：domain registry 是事实源，runtime registry 是运行态绑定投影。
 */

import { createProviderCarrier, type ProviderCarrier, type ProviderCarrierInput } from "./providerCarrier.js";

export type ProviderAccessRegistryRequest = {
  registryId?: string;
  carriers?: readonly ProviderCarrierInput[];
  allowedScopes?: readonly string[];
};

export type ProviderAccessRegistry = {
  registryId: string;
  carriers: readonly ProviderCarrier[];
  carrierIds: readonly string[];
  providers: readonly string[];
  capabilities: readonly string[];
  grantedScopes: readonly string[];
  publicSafe: true;
};

export type ProviderAccessRegistryResult =
  | { ok: true; registry: ProviderAccessRegistry; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "MISSING_REGISTRY_ID" | "MISSING_CARRIERS" | "DUPLICATE_CARRIER_ID" | "SCOPE_DENIED" | "INVALID_CARRIER";
        message: string;
        boundary: "input" | "registry" | "scope";
        publicSafe: true;
      };
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: "MISSING_REGISTRY_ID" | "MISSING_CARRIERS" | "DUPLICATE_CARRIER_ID" | "SCOPE_DENIED" | "INVALID_CARRIER",
  message: string,
  boundary: "input" | "registry" | "scope",
): ProviderAccessRegistryResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.providerAccess.providerCarrierRegistry.rejected"],
  };
}

export function registerProviderAccessCarriers(request: ProviderAccessRegistryRequest = {}): ProviderAccessRegistryResult {
  if (!hasText(request.registryId)) {
    return failure("MISSING_REGISTRY_ID", "provider access registry requires a registryId", "input");
  }

  if ((request.carriers ?? []).length === 0) {
    return failure("MISSING_CARRIERS", "provider access registry requires at least one carrier", "input");
  }

  const carriers: ProviderCarrier[] = [];
  const seen = new Set<string>();
  for (const carrierInput of request.carriers ?? []) {
    const created = createProviderCarrier(carrierInput);
    if (!created.ok) {
      return failure("INVALID_CARRIER", created.error.message, "registry");
    }

    if (seen.has(created.carrier.carrierId)) {
      return failure("DUPLICATE_CARRIER_ID", `duplicate provider carrierId: ${created.carrier.carrierId}`, "registry");
    }

    seen.add(created.carrier.carrierId);
    carriers.push(created.carrier);
  }

  const allowedScopes = cleanList(request.allowedScopes);
  const requestedScopes = cleanList(carriers.flatMap((carrier) => carrier.scopes));
  const deniedScopes = allowedScopes.length === 0 ? [] : requestedScopes.filter((scope) => !allowedScopes.includes(scope));
  if (deniedScopes.length > 0) {
    return failure("SCOPE_DENIED", `provider carrier requested scopes outside governance: ${deniedScopes.join(", ")}`, "scope");
  }

  return {
    ok: true,
    registry: {
      registryId: request.registryId.trim(),
      carriers,
      carrierIds: carriers.map((carrier) => carrier.carrierId),
      providers: [...new Set(carriers.map((carrier) => carrier.provider))],
      capabilities: cleanList(carriers.flatMap((carrier) => carrier.capabilities)),
      grantedScopes: requestedScopes,
      publicSafe: true,
    },
    events: ["agentCore.modelAdapter.providerAccess.providerCarrierRegistry.registered"],
  };
}
