/*
 * 文件定位：Agent 运行态实现层 / provider route 绑定面。
 * 核心目的：记录 runtime 可用的 provider routes，不直接执行 provider 调用。
 * 边界：只绑定 provider route 引用和 metadata，不读取密钥、不探测 provider、不发送请求。
 * 对接：上接 runtime.modelAdapter 绑定面，下接 modelAdapter registry/client 暴露的 provider route。
 * 实现提示：保持纯函数和结构化错误，让上层应用、devdoctor 和 runtime inspection 可直接消费绑定结果。
 */

import type { ModelAdapterRuntimeCaller, ModelAdapterRuntimeGate } from "./modelAdapterRuntime.js";

export type ProviderRouteBindingBoundary = "input" | "contract" | "governance" | "runtime-state" | "binding";
export type ProviderRouteBindingErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_ROUTE_GROUP"
  | "MISSING_ROUTE_GROUP_ID"
  | "EMPTY_PROVIDER_ROUTES"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type ProviderRouteBindingError = {
  code: ProviderRouteBindingErrorCode;
  message: string;
  boundary: ProviderRouteBindingBoundary;
  publicSafe: true;
};

export type ProviderRouteRef = {
  provider: string;
  routeId: string;
  protocolId?: string;
};

export type ProviderRouteBindingInput = {
  id?: string;
  routes?: readonly ProviderRouteRef[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ProviderRouteBindingRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  routeGroup?: ProviderRouteBindingInput;
  runtimeReady?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
};

export type ProviderRouteBinding = {
  bindingId: string;
  runtimeId: string;
  routeGroupId: string;
  caller: ModelAdapterRuntimeCaller;
  surface: "provider";
  route: "runtime.modelAdapter.providerRoutes";
  routes: readonly ProviderRouteRef[];
  providers: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: true;
  unsafeSideEffects: false;
};

export type ProviderRouteBindingResult =
  | { ok: true; binding: ProviderRouteBinding; events: readonly string[] }
  | { ok: false; error: ProviderRouteBindingError; events: readonly string[] };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeCaller(caller: ModelAdapterRuntimeCaller): ModelAdapterRuntimeCaller {
  const normalized: ModelAdapterRuntimeCaller = { kind: caller.kind, id: caller.id.trim() };
  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) normalized.moduleId = moduleId;
  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) normalized.sessionId = sessionId;
  return normalized;
}

function failure(
  code: ProviderRouteBindingErrorCode,
  message: string,
  boundary: ProviderRouteBindingBoundary,
): ProviderRouteBindingResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.providerRoutes.rejected"],
  };
}

function normalizeRoutes(routes: readonly ProviderRouteRef[] | undefined): readonly ProviderRouteRef[] {
  return (routes ?? [])
    .map((route) => ({
      provider: route.provider.trim(),
      routeId: route.routeId.trim(),
      ...(hasText(route.protocolId) ? { protocolId: route.protocolId.trim() } : {}),
    }))
    .filter((route) => route.provider.length > 0 && route.routeId.length > 0);
}

export function bindProviderRoutes(request?: ProviderRouteBindingRequest): ProviderRouteBindingResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "provider route binding requires a runtimeId", "input");
  }
  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "provider route binding requires a caller", "input");
  }
  if (request.routeGroup === undefined) {
    return failure("MISSING_ROUTE_GROUP", "provider route binding requires a route group input", "input");
  }
  if (!hasText(request.routeGroup.id)) {
    return failure("MISSING_ROUTE_GROUP_ID", "provider route binding requires a stable route group id", "input");
  }
  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "provider routes can only bind through a ready runtime host", "runtime-state");
  }
  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "provider route binding was rejected by contract surface", "contract");
  }
  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "provider route binding was rejected by governance", "governance");
  }

  const routes = normalizeRoutes(request.routeGroup.routes);
  if (routes.length === 0) {
    return failure("EMPTY_PROVIDER_ROUTES", "provider route binding requires at least one provider route", "binding");
  }
  const runtimeId = request.runtimeId.trim();
  const routeGroupId = request.routeGroup.id.trim();
  return {
    ok: true,
    binding: {
      bindingId: `${runtimeId}:providerRoutes:${routeGroupId}`,
      runtimeId,
      routeGroupId,
      caller: normalizeCaller(request.caller),
      surface: "provider",
      route: "runtime.modelAdapter.providerRoutes",
      routes,
      providers: [...new Set(routes.map((route) => route.provider))],
      metadata: request.routeGroup.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.providerRoutes.bound"],
  };
}
