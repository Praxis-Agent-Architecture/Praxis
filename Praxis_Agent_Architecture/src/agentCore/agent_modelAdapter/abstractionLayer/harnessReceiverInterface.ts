/*
 * 文件定位：Agent 模型适配层 / 模型抽象层。
 * 核心目的：承载 harness Receiver Interface 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：负责把任意厂商/格式抽象到 DSL 定义的能力形态，不直接做 agentCore 内部最终调用。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

export type HarnessReceiverBoundary = "input" | "contract" | "governance" | "scope" | "source";

export type HarnessReceiverErrorCode =
  | "MISSING_RECEIVER_ID"
  | "MISSING_HARNESS_ID"
  | "MISSING_SIGNAL"
  | "MISSING_PROVIDER_ID"
  | "MISSING_SOURCE"
  | "EMPTY_CAPABILITY_SIGNAL"
  | "SOURCE_DENIED"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "SCOPE_DENIED";

export type HarnessReceiverGate = {
  accepted: boolean;
  reason?: string;
};

export type HarnessOutputInterfaceSignal = {
  interfaceId?: string;
  modality?: string;
  channels?: readonly string[];
  scopes?: readonly string[];
};

export type HarnessCapabilitySignal = {
  providerId?: string;
  modelId?: string;
  source?: "provider-carrier" | "custom-format" | "runtime-model-adapter" | string;
  capabilities?: readonly string[];
  outputInterfaces?: readonly HarnessOutputInterfaceSignal[];
  scopes?: readonly string[];
  formatHints?: readonly string[];
  rawShapeRef?: string;
};

export type HarnessReceiverRequest = {
  receiverId?: string;
  harnessId?: string;
  runtimeId?: string;
  signal?: HarnessCapabilitySignal;
  allowedSources?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: HarnessReceiverGate;
  governance?: HarnessReceiverGate;
};

export type HarnessReceiverError = {
  code: HarnessReceiverErrorCode;
  message: string;
  boundary: HarnessReceiverBoundary;
  safeForRuntimeInspection: true;
  providerRawShapeExposed: false;
};

export type HarnessReceivedInterface = {
  interfaceId: string;
  modality: string;
  channels: readonly string[];
  scopes: readonly string[];
};

export type HarnessReceivedModelInterface = {
  kind: "harness-receiver-interface";
  receiverId: string;
  harnessId: string;
  runtimeId?: string;
  providerId: string;
  modelId?: string;
  source: string;
  capabilities: readonly string[];
  outputInterfaces: readonly HarnessReceivedInterface[];
  scopes: readonly string[];
  formatHints: readonly string[];
  rawShapeRef?: string;
  providerRawShapeExposed: false;
  networkCalled: false;
  providerCallPlanned: false;
  unsafeSideEffects: false;
};

export type HarnessReceiverResult =
  | {
      ok: true;
      received: HarnessReceivedModelInterface;
      events: readonly string[];
    }
  | {
      ok: false;
      error: HarnessReceiverError;
      events: readonly string[];
    };

export const harnessReceiverInterfaceDescriptor = {
  capability: "harness-receiver-interface",
  route: "agent_modelAdapter.abstractionLayer",
  purpose: "receive provider or custom-format capability signals into a provider-neutral abstraction envelope",
  providerRawShapeExposed: false,
  networkCalled: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function uniqueStrings(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function failure(
  code: HarnessReceiverErrorCode,
  message: string,
  boundary: HarnessReceiverBoundary,
): HarnessReceiverResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true, providerRawShapeExposed: false },
    events: ["modelAdapter.harnessReceiverInterface.rejected"],
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

function isAllowedSource(source: string, allowedSources: readonly string[] | undefined): boolean {
  const allowed = uniqueStrings(allowedSources);
  return allowed.length === 0 || allowed.includes(source);
}

function normalizeInterfaces(items: readonly HarnessOutputInterfaceSignal[] | undefined): readonly HarnessReceivedInterface[] {
  return (items ?? []).map((item, index) => ({
    interfaceId: item.interfaceId?.trim() || `harness-output:${index + 1}`,
    modality: item.modality?.trim() || "unknown",
    channels: uniqueStrings(item.channels),
    scopes: uniqueStrings(item.scopes),
  }));
}

function hasCapabilityMaterial(signal: HarnessCapabilitySignal): boolean {
  return (
    uniqueStrings(signal.capabilities).length > 0 ||
    normalizeInterfaces(signal.outputInterfaces).length > 0 ||
    uniqueStrings(signal.scopes).length > 0 ||
    uniqueStrings(signal.formatHints).length > 0
  );
}

export function receiveHarnessReceiverInterface(request?: HarnessReceiverRequest): HarnessReceiverResult {
  if (request === undefined || isBlank(request.receiverId)) {
    return failure("MISSING_RECEIVER_ID", "harnessReceiverInterface requires a receiverId", "input");
  }

  if (isBlank(request.harnessId)) {
    return failure("MISSING_HARNESS_ID", "harnessReceiverInterface requires a harnessId", "input");
  }

  if (request.signal === undefined) {
    return failure("MISSING_SIGNAL", "harnessReceiverInterface requires a capability signal envelope", "input");
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "harness receiver was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "harness receiver was rejected by runtime governance",
      "governance",
    );
  }

  const denied = deniedScope(request.requestedScopes, request.allowedScopes);
  if (denied !== undefined) {
    return failure("SCOPE_DENIED", `harness receiver scope ${denied} is outside runtime governance`, "scope");
  }

  const providerId = request.signal.providerId?.trim();
  if (isBlank(providerId)) {
    return failure("MISSING_PROVIDER_ID", "harness capability signal requires a providerId", "input");
  }

  const source = request.signal.source?.trim();
  if (isBlank(source)) {
    return failure("MISSING_SOURCE", "harness capability signal requires a source", "source");
  }

  if (!isAllowedSource(source ?? "", request.allowedSources)) {
    return failure("SOURCE_DENIED", `harness source ${source} is outside the receiver boundary`, "source");
  }

  if (!hasCapabilityMaterial(request.signal)) {
    return failure(
      "EMPTY_CAPABILITY_SIGNAL",
      "harness capability signal must include capabilities, output interfaces, scopes, or format hints",
      "input",
    );
  }

  return {
    ok: true,
    received: {
      kind: "harness-receiver-interface",
      receiverId: request.receiverId?.trim() ?? "",
      harnessId: request.harnessId?.trim() ?? "",
      runtimeId: request.runtimeId?.trim() || undefined,
      providerId: providerId ?? "",
      modelId: request.signal.modelId?.trim() || undefined,
      source: source ?? "",
      capabilities: uniqueStrings(request.signal.capabilities),
      outputInterfaces: normalizeInterfaces(request.signal.outputInterfaces),
      scopes: uniqueStrings(request.signal.scopes),
      formatHints: uniqueStrings(request.signal.formatHints),
      rawShapeRef: request.signal.rawShapeRef?.trim() || undefined,
      providerRawShapeExposed: false,
      networkCalled: false,
      providerCallPlanned: false,
      unsafeSideEffects: false,
    },
    events: ["modelAdapter.harnessReceiverInterface.received"],
  };
}
