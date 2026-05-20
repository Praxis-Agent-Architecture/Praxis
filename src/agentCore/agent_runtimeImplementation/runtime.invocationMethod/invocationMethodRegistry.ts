/*
 * 文件定位：Agent 运行态实现层 / 运行态调用方法层。
 * 核心目的：承载 invocation Method Registry 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export const invocationMethodKinds = ["agent", "tool", "model", "interface", "stream", "batch"] as const;

export type InvocationMethodKind = (typeof invocationMethodKinds)[number];

export type InvocationMethodRegistryBoundary = "input" | "contract" | "governance" | "registry";

export type InvocationMethodRegistryErrorCode =
  | "MISSING_METHOD"
  | "UNKNOWN_METHOD"
  | "MISSING_SURFACE_ID"
  | "DUPLICATE_METHOD"
  | "METHOD_NOT_REGISTERED"
  | "METHOD_DISABLED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED";

export type InvocationMethodRegistryError = {
  code: InvocationMethodRegistryErrorCode;
  message: string;
  boundary: InvocationMethodRegistryBoundary;
};

export type InvocationMethodGate = {
  accepted: boolean;
  reason?: string;
};

export type InvocationMethodDescriptor = {
  method?: InvocationMethodKind | string;
  surfaceId?: string;
  capability?: string;
  enabled?: boolean;
  contract?: InvocationMethodGate;
  governance?: InvocationMethodGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RegisteredInvocationMethod = {
  method: InvocationMethodKind;
  surfaceId: string;
  capability?: string;
  enabled: boolean;
  metadata: Readonly<Record<string, unknown>>;
};

export type InvocationMethodResolveResult =
  | {
      ok: true;
      method: RegisteredInvocationMethod;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationMethodRegistryError;
      events: readonly string[];
    };

export type InvocationMethodRegistry = {
  methods: readonly RegisteredInvocationMethod[];
  has: (method: InvocationMethodKind | string) => boolean;
  resolve: (method: InvocationMethodKind | string) => InvocationMethodResolveResult;
};

export type InvocationMethodRegistryRequest = {
  methods?: readonly InvocationMethodDescriptor[];
};

export type InvocationMethodRegistryResult =
  | {
      ok: true;
      registry: InvocationMethodRegistry;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InvocationMethodRegistryError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isInvocationMethodKind(value: unknown): value is InvocationMethodKind {
  return typeof value === "string" && invocationMethodKinds.includes(value as InvocationMethodKind);
}

function failure(
  code: InvocationMethodRegistryErrorCode,
  message: string,
  boundary: InvocationMethodRegistryBoundary,
): InvocationMethodRegistryResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["invocation.method.registry.rejected"],
  };
}

function resolveFailure(
  code: InvocationMethodRegistryErrorCode,
  message: string,
  boundary: InvocationMethodRegistryBoundary,
): InvocationMethodResolveResult {
  return {
    ok: false,
    error: { code, message, boundary },
    events: ["invocation.method.resolve.rejected"],
  };
}

function normalizeDescriptor(
  descriptor: InvocationMethodDescriptor,
): InvocationMethodRegistryResult | RegisteredInvocationMethod {
  const rawMethod = descriptor.method?.trim();
  const rawSurfaceId = descriptor.surfaceId?.trim();

  if (!hasText(rawMethod)) {
    return failure("MISSING_METHOD", "invocation method registry entries require a method", "input");
  }

  if (!isInvocationMethodKind(rawMethod)) {
    return failure("UNKNOWN_METHOD", `unknown invocation method ${String(descriptor.method)}`, "input");
  }

  if (!hasText(rawSurfaceId)) {
    return failure("MISSING_SURFACE_ID", "invocation method registry entries require a surfaceId", "input");
  }

  if (descriptor.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      descriptor.contract.reason ?? `contract rejected invocation method ${rawMethod}`,
      "contract",
    );
  }

  if (descriptor.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      descriptor.governance.reason ?? `governance rejected invocation method ${rawMethod}`,
      "governance",
    );
  }

  return {
    method: rawMethod,
    surfaceId: rawSurfaceId,
    capability: descriptor.capability?.trim() || undefined,
    enabled: descriptor.enabled !== false,
    metadata: descriptor.metadata ?? {},
  };
}

export function createInvocationMethodRegistry(
  request: InvocationMethodRegistryRequest,
): InvocationMethodRegistryResult {
  const records: RegisteredInvocationMethod[] = [];
  const seen = new Set<InvocationMethodKind>();

  for (const descriptor of request.methods ?? []) {
    const normalized = normalizeDescriptor(descriptor);
    if ("ok" in normalized) {
      return normalized;
    }

    if (seen.has(normalized.method)) {
      return failure("DUPLICATE_METHOD", `invocation method ${normalized.method} is registered more than once`, "registry");
    }

    seen.add(normalized.method);
    records.push(normalized);
  }

  const registry: InvocationMethodRegistry = {
    methods: records,
    has(method: InvocationMethodKind | string): boolean {
      return records.some((record) => record.method === method);
    },
    resolve(method: InvocationMethodKind | string): InvocationMethodResolveResult {
      if (!isInvocationMethodKind(method)) {
        return resolveFailure("UNKNOWN_METHOD", `unknown invocation method ${String(method)}`, "input");
      }

      const record = records.find((candidate) => candidate.method === method);
      if (record === undefined) {
        return resolveFailure("METHOD_NOT_REGISTERED", `invocation method ${method} is not registered`, "registry");
      }

      if (!record.enabled) {
        return resolveFailure("METHOD_DISABLED", `invocation method ${method} is disabled`, "registry");
      }

      return {
        ok: true,
        method: record,
        events: ["invocation.method.resolved"],
      };
    },
  };

  return {
    ok: true,
    registry,
    events: ["invocation.method.registry.ready"],
  };
}
