/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 interface Scope 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type InterfaceScopeBoundary = "input" | "governance" | "scope";

export type InterfaceScopeGate = {
  accepted: boolean;
  reason?: string;
};

export type InterfaceScopeRequest = {
  providerId?: string;
  interfaceId?: string;
  requestedCapabilities?: readonly string[];
  grantedCapabilities?: readonly string[];
  requestedFormats?: readonly string[];
  grantedFormats?: readonly string[];
  governance?: InterfaceScopeGate;
};

export type InterfaceScopeDecision = {
  providerId: string;
  interfaceId: string;
  accepted: boolean;
  requestedCapabilities: readonly string[];
  grantedCapabilities: readonly string[];
  missingCapabilities: readonly string[];
  requestedFormats: readonly string[];
  grantedFormats: readonly string[];
  missingFormats: readonly string[];
  readonly: true;
  unsafeSideEffects: false;
};

export type InterfaceScopeErrorCode =
  | "MISSING_PROVIDER_ID"
  | "MISSING_INTERFACE_ID"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type InterfaceScopeError = {
  code: InterfaceScopeErrorCode;
  message: string;
  boundary: InterfaceScopeBoundary;
  publicSafe: true;
};

export type InterfaceScopeResult =
  | {
      ok: true;
      decision: InterfaceScopeDecision;
      events: readonly string[];
    }
  | {
      ok: false;
      error: InterfaceScopeError;
      decision?: InterfaceScopeDecision;
      events: readonly string[];
    };

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function toScopeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => toScopeToken(value)).filter(Boolean))];
}

function failure(code: InterfaceScopeErrorCode, message: string, boundary: InterfaceScopeBoundary): InterfaceScopeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["agentCore.modelAdapter.interfaceScope.rejected"],
  };
}

function buildDecision(request: Required<Pick<InterfaceScopeRequest, "providerId" | "interfaceId">> & InterfaceScopeRequest): InterfaceScopeDecision {
  const requestedCapabilities = cleanList(request.requestedCapabilities);
  const grantedCapabilities = cleanList(request.grantedCapabilities);
  const requestedFormats = cleanList(request.requestedFormats);
  const grantedFormats = cleanList(request.grantedFormats);

  const missingCapabilities = requestedCapabilities.filter((capability) => !grantedCapabilities.includes(capability));
  const missingFormats = requestedFormats.filter((format) => !grantedFormats.includes(format));

  return {
    providerId: request.providerId.trim(),
    interfaceId: request.interfaceId.trim(),
    accepted: missingCapabilities.length === 0 && missingFormats.length === 0,
    requestedCapabilities,
    grantedCapabilities,
    missingCapabilities,
    requestedFormats,
    grantedFormats,
    missingFormats,
    readonly: true,
    unsafeSideEffects: false,
  };
}

export function evaluateInterfaceScope(request?: InterfaceScopeRequest): InterfaceScopeResult {
  if (request === undefined || isBlank(request.providerId)) {
    return failure("MISSING_PROVIDER_ID", "interface scope requires a providerId", "input");
  }

  if (isBlank(request.interfaceId)) {
    return failure("MISSING_INTERFACE_ID", "interface scope requires an interfaceId", "input");
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "interface scope was rejected by governance",
      "governance",
    );
  }

  const providerId = request.providerId ?? "";
  const interfaceId = request.interfaceId ?? "";
  const decision = buildDecision({
    ...request,
    providerId,
    interfaceId,
  });

  if (!decision.accepted) {
    return {
      ok: false,
      error: {
        code: "SCOPE_DENIED",
        message: "interface scope is missing requested capabilities or formats",
        boundary: "scope",
        publicSafe: true,
      },
      decision,
      events: ["agentCore.modelAdapter.interfaceScope.denied"],
    };
  }

  return {
    ok: true,
    decision,
    events: ["agentCore.modelAdapter.interfaceScope.allow"],
  };
}
