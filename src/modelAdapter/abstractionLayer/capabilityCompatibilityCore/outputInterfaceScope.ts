/*
 * 文件定位：Agent 模型适配层 / 模型抽象层 / 能力兼容核心。
 * 核心目的：承载 output Interface Scope 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type OutputInterfaceModality = "text" | "image" | "audio" | "video" | "embedding" | "structured" | "tool-call";

export type OutputInterfaceChannel = "single" | "stream" | "batch" | "callback";

export type OutputInterfaceScopeBoundary = "input" | "contract" | "governance" | "scope" | "compatibility";

export type OutputInterfaceScopeErrorCode =
  | "MISSING_PROVIDER_ID"
  | "EMPTY_OUTPUT_INTERFACES"
  | "MISSING_INTERFACE_ID"
  | "MISSING_MODALITY"
  | "EMPTY_INTERFACE_SCOPE"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED"
  | "UNSUPPORTED_OUTPUT_SCOPE";

export type OutputInterfaceScopeGate = {
  accepted: boolean;
  reason?: string;
};

export type OutputInterfaceScopeTrace = {
  runtimeId?: string;
  correlationId?: string;
};

export type OutputInterfaceScopeDraft = {
  interfaceId?: string;
  modality?: OutputInterfaceModality | string;
  channels?: readonly (OutputInterfaceChannel | string)[];
  scopes?: readonly string[];
  formatHint?: string;
  required?: boolean;
};

export type OutputInterfaceScopeRequest = {
  providerId?: string;
  modelId?: string;
  outputInterfaces?: readonly OutputInterfaceScopeDraft[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  trace?: OutputInterfaceScopeTrace;
  contract?: OutputInterfaceScopeGate;
  governance?: OutputInterfaceScopeGate;
};

export type OutputInterfaceScopeError = {
  code: OutputInterfaceScopeErrorCode;
  message: string;
  boundary: OutputInterfaceScopeBoundary;
  safeForRuntimeInspection: true;
  providerRawShapeExposed: false;
};

export type ScopedOutputInterface = {
  interfaceId: string;
  modality: OutputInterfaceModality | string;
  channels: readonly (OutputInterfaceChannel | string)[];
  scopes: readonly string[];
  formatHint?: string;
  required: boolean;
  bridgeable: boolean;
};

export type OutputInterfaceScopeCompatibility = "compatible" | "partial" | "incompatible";

export type OutputInterfaceScopeGap = {
  interfaceId: string;
  scope: string;
  reason: string;
};

export type OutputInterfaceScopeDefinition = {
  kind: "output-interface-scope";
  providerId: string;
  modelId?: string;
  trace: OutputInterfaceScopeTrace;
  interfaces: readonly ScopedOutputInterface[];
  requestedScopes: readonly string[];
  compatibility: OutputInterfaceScopeCompatibility;
  gaps: readonly OutputInterfaceScopeGap[];
  bridgeReady: boolean;
  providerRawShapeExposed: false;
  unsafeSideEffects: false;
};

export type OutputInterfaceScopeResult =
  | {
      ok: true;
      scope: OutputInterfaceScopeDefinition;
      events: readonly string[];
    }
  | {
      ok: false;
      error: OutputInterfaceScopeError;
      events: readonly string[];
    };

export const outputInterfaceScopeDescriptor = {
  capability: "output-interface-scope",
  route: "agent_modelAdapter.abstractionLayer.capabilityCompatibilityCore",
  purpose: "normalize provider output interface scopes for bridging-layer compatibility checks",
  providerRawShapeExposed: false,
  unsafeSideEffects: false,
} as const;

const knownOutputModalities = ["text", "image", "audio", "video", "embedding", "structured", "tool-call"] as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function uniqueStrings(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: OutputInterfaceScopeErrorCode,
  message: string,
  boundary: OutputInterfaceScopeBoundary,
): OutputInterfaceScopeResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, providerRawShapeExposed: false },
    events: ["modelAdapter.outputInterfaceScope.rejected"],
  };
}

function deniedScope(requestedScopes: readonly string[] | undefined, allowedScopes: readonly string[] | undefined): string | undefined {
  const requested = uniqueStrings(requestedScopes);
  if (requested.length === 0) {
    return undefined;
  }

  const allowed = new Set(uniqueStrings(allowedScopes));
  return requested.find((scope) => !allowed.has(scope));
}

function cleanTrace(trace: OutputInterfaceScopeTrace | undefined): OutputInterfaceScopeTrace {
  return {
    runtimeId: trace?.runtimeId?.trim() || undefined,
    correlationId: trace?.correlationId?.trim() || undefined,
  };
}

function isKnownOutputModality(value: string): boolean {
  return knownOutputModalities.includes(value as OutputInterfaceModality);
}

function evaluateCompatibility(
  interfaces: readonly ScopedOutputInterface[],
  requestedScopes: readonly string[],
): Pick<OutputInterfaceScopeDefinition, "compatibility" | "gaps" | "bridgeReady"> {
  const gaps: OutputInterfaceScopeGap[] = [];

  for (const item of interfaces) {
    if (!isKnownOutputModality(item.modality)) {
      gaps.push({
        interfaceId: item.interfaceId,
        scope: item.scopes[0] ?? "unknown",
        reason: `output modality ${item.modality} is not yet part of the agentCore DSL shape`,
      });
    }

    for (const requestedScope of requestedScopes) {
      if (!item.scopes.includes(requestedScope)) {
        gaps.push({
          interfaceId: item.interfaceId,
          scope: requestedScope,
          reason: "requested scope is not advertised by this output interface",
        });
      }
    }
  }

  const requiredInterfaces = interfaces.filter((item) => item.required);
  const requiredGap = gaps.some((gap) => requiredInterfaces.some((item) => item.interfaceId === gap.interfaceId));
  const compatibleInterfaces = interfaces.filter((item) => !gaps.some((gap) => gap.interfaceId === item.interfaceId));

  if (interfaces.length === 0 || compatibleInterfaces.length === 0 || requiredGap) {
    return { compatibility: "incompatible", gaps, bridgeReady: false };
  }

  if (gaps.length > 0) {
    return { compatibility: "partial", gaps, bridgeReady: true };
  }

  return { compatibility: "compatible", gaps, bridgeReady: true };
}

export function defineOutputInterfaceScope(request?: OutputInterfaceScopeRequest): OutputInterfaceScopeResult {
  if (request === undefined || isBlank(request.providerId)) {
    return failure("MISSING_PROVIDER_ID", "outputInterfaceScope requires a providerId before abstraction", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "output interface scope was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "output interface scope was rejected by runtime governance",
      "governance",
    );
  }

  const denied = deniedScope(request.requestedScopes, request.allowedScopes);
  if (denied !== undefined) {
    return failure("SCOPE_DENIED", `output interface scope ${denied} is outside runtime governance`, "scope");
  }

  const drafts = request.outputInterfaces ?? [];
  if (drafts.length === 0) {
    return failure("EMPTY_OUTPUT_INTERFACES", "at least one output interface is required for scope abstraction", "input");
  }

  const interfaces: ScopedOutputInterface[] = [];

  for (const [index, draft] of drafts.entries()) {
    const interfaceId = draft.interfaceId?.trim();
    if (isBlank(interfaceId)) {
      return failure("MISSING_INTERFACE_ID", `output interface ${index + 1} requires an interfaceId`, "input");
    }

    const modality = draft.modality?.trim();
    if (isBlank(modality)) {
      return failure("MISSING_MODALITY", `output interface ${interfaceId} requires a modality`, "input");
    }

    const scopes = uniqueStrings(draft.scopes);
    if (scopes.length === 0) {
      return failure("EMPTY_INTERFACE_SCOPE", `output interface ${interfaceId} requires at least one scope`, "scope");
    }

    interfaces.push({
      interfaceId: interfaceId ?? "",
      modality: modality ?? "",
      channels: uniqueStrings(draft.channels) as readonly (OutputInterfaceChannel | string)[],
      scopes,
      formatHint: draft.formatHint?.trim() || undefined,
      required: draft.required === true,
      bridgeable: isKnownOutputModality(modality ?? ""),
    });
  }

  const requestedScopes = uniqueStrings(request.requestedScopes);
  const compatibility = evaluateCompatibility(interfaces, requestedScopes);
  if (compatibility.compatibility === "incompatible") {
    const firstGap = compatibility.gaps[0];
    if (firstGap !== undefined) {
      return failure("UNSUPPORTED_OUTPUT_SCOPE", firstGap.reason, "compatibility");
    }
  }

  return {
    ok: true,
    scope: {
      kind: "output-interface-scope",
      providerId: request.providerId?.trim() ?? "",
      modelId: request.modelId?.trim() || undefined,
      trace: cleanTrace(request.trace),
      interfaces,
      requestedScopes,
      compatibility: compatibility.compatibility,
      gaps: compatibility.gaps,
      bridgeReady: compatibility.bridgeReady,
      providerRawShapeExposed: false,
      unsafeSideEffects: false,
    },
    events: ["modelAdapter.outputInterfaceScope.defined"],
  };
}
