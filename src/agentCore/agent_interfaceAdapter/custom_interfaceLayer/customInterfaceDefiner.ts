/*
 * 文件定位：Agent 接口适配层 / 自定义接口层。
 * 核心目的：承载 custom Interface Definer 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：定义接口接入方式，不实现 CMP/MP/TAP/multiagent 的内部策略。
 * 对接：需要被 runtime.interfaceAdapter 拉起，并服务官方模块和自定义接口进入 agentCore。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type CustomInterfaceSource = "runtime" | "official-module" | "custom-interface";

export type CustomInterfaceBoundary = "input" | "contract" | "governance" | "scope";

export type CustomInterfaceErrorCode =
  | "MISSING_INTERFACE_ID"
  | "MISSING_ENTRYPOINT"
  | "MISSING_CAPABILITY"
  | "INVALID_CAPABILITY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type CustomInterfaceGate = {
  accepted: boolean;
  reason?: string;
};

export type CustomInterfaceError = {
  code: CustomInterfaceErrorCode;
  message: string;
  boundary: CustomInterfaceBoundary;
};

export type CustomInterfaceCapabilityInput = {
  name?: string;
  operations?: readonly string[];
  scopes?: readonly string[];
};

export type CustomInterfaceCapability = {
  name: string;
  operations: readonly string[];
  scopes: readonly string[];
};

export type CustomInterfaceDefinitionRequest = {
  interfaceId?: string;
  entrypoint?: string;
  source?: CustomInterfaceSource;
  owner?: string;
  capabilities?: readonly CustomInterfaceCapabilityInput[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: CustomInterfaceGate;
  governance?: CustomInterfaceGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type CustomInterfaceDefinition = {
  interfaceId: string;
  entrypoint: string;
  source: CustomInterfaceSource;
  owner?: string;
  capabilities: readonly CustomInterfaceCapability[];
  scopes: readonly string[];
  lifecycle: "defined";
  runtimeGoverned: true;
  dispatch: "dry-run";
  metadata: Readonly<Record<string, unknown>>;
};

export type CustomInterfaceDefinitionResult =
  | {
      ok: true;
      definition: CustomInterfaceDefinition;
      events: readonly string[];
    }
  | {
      ok: false;
      error: CustomInterfaceError;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueTrimmed(values: readonly string[] | undefined): readonly string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length > 0) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

export function hasCustomInterfaceScopeAccess(
  requestedScopes: readonly string[] | undefined,
  allowedScopes: readonly string[] | undefined,
): boolean {
  const requested = uniqueTrimmed(requestedScopes);
  if (requested.length === 0) {
    return true;
  }

  const allowed = new Set(uniqueTrimmed(allowedScopes));
  return requested.every((scope) => allowed.has(scope));
}

export function createCustomInterfaceError(
  code: CustomInterfaceErrorCode,
  message: string,
  boundary: CustomInterfaceBoundary,
): CustomInterfaceError {
  return { code, message, boundary };
}

function failure(
  code: CustomInterfaceErrorCode,
  message: string,
  boundary: CustomInterfaceBoundary,
): CustomInterfaceDefinitionResult {
  return {
    ok: false,
    error: createCustomInterfaceError(code, message, boundary),
    events: ["custom.interface.definition.rejected"],
  };
}

function normalizeCapabilities(
  capabilities: readonly CustomInterfaceCapabilityInput[] | undefined,
): CustomInterfaceDefinitionResult | readonly CustomInterfaceCapability[] {
  if ((capabilities ?? []).length === 0) {
    return failure("MISSING_CAPABILITY", "custom interface definition requires at least one capability", "input");
  }

  const normalized: CustomInterfaceCapability[] = [];
  for (const capability of capabilities ?? []) {
    const name = capability.name?.trim();
    if (!hasText(name)) {
      return failure("INVALID_CAPABILITY", "custom interface capabilities require a name", "input");
    }

    normalized.push({
      name,
      operations: uniqueTrimmed(capability.operations),
      scopes: uniqueTrimmed(capability.scopes),
    });
  }

  return normalized;
}

export function defineCustomInterface(
  request?: CustomInterfaceDefinitionRequest,
): CustomInterfaceDefinitionResult {
  const interfaceId = request?.interfaceId?.trim();
  if (!hasText(interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "custom interface definition requires an interfaceId", "input");
  }

  const entrypoint = request?.entrypoint?.trim();
  if (!hasText(entrypoint)) {
    return failure("MISSING_ENTRYPOINT", "custom interface definition requires an entrypoint", "input");
  }

  if (request?.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? `contract rejected custom interface ${interfaceId}`,
      "contract",
    );
  }

  if (request?.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? `governance rejected custom interface ${interfaceId}`,
      "governance",
    );
  }

  if (!hasCustomInterfaceScopeAccess(request?.requestedScopes, request?.allowedScopes)) {
    return failure("SCOPE_DENIED", `scope denied for custom interface ${interfaceId}`, "scope");
  }

  const capabilities = normalizeCapabilities(request?.capabilities);
  if ("ok" in capabilities) {
    return capabilities;
  }

  const capabilityScopes = capabilities.flatMap((capability) => capability.scopes);
  const explicitScopes = uniqueTrimmed(request?.requestedScopes);

  return {
    ok: true,
    definition: {
      interfaceId,
      entrypoint,
      source: request?.source ?? "custom-interface",
      owner: request?.owner?.trim() || undefined,
      capabilities,
      scopes: uniqueTrimmed([...explicitScopes, ...capabilityScopes]),
      lifecycle: "defined",
      runtimeGoverned: true,
      dispatch: "dry-run",
      metadata: request?.metadata ?? {},
    },
    events: ["custom.interface.defined"],
  };
}
