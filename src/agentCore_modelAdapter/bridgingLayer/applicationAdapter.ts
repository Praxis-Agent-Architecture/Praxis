/*
 * 文件定位：Agent 模型适配层 / agentCore 内部桥接层。
 * 核心目的：把模型适配层最终产物转成 agentCore 内部实际可用的调用形态。
 * 能力要求1：actualInvocationLayer 负责拿到上游 provider/API endpoint 的真实可用调用面。
 * 能力要求2：abstractionLayer 负责根据 DSL 和格式映射完成跨厂商抽象与转换。
 * 能力要求3：本文件处在最后一步：把抽象层整理好的能力暴露成 agentCore 一看就能接入的形态。
 * 边界：负责进入 agentCore 前的最后适配，不重新处理上游 endpoint 细节。
 * 对接：需要被 runtime.modelAdapter 拉起，并和 provider/carrier、PromptPack lowering、能力抽象链路接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  checkApplicationModelCompatibility,
  type ApplicationBridgeCandidate,
  type ApplicationBridgeCapability,
  type ApplicationBridgeFormat,
  type ApplicationCompatibilityGate,
  type ApplicationCompatibilityReport,
} from "./applicationCompatibilityCheck.js";

export type ApplicationAdapterBoundary = "input" | "contract" | "governance" | "scope" | "compatibility" | "invocation";

export type ApplicationModelMessage = {
  role: "system" | "user" | "assistant" | "tool" | string;
  content: string;
};

export type ApplicationModelInvocationInput = {
  invocationId?: string;
  prompt?: string;
  messages?: readonly ApplicationModelMessage[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type ApplicationModelOutput = {
  kind: "agentCore.modelAdapter.applicationInvocationOutput";
  content: unknown;
  dryRun: boolean;
  providerPayloadCreated: false;
  unsafeSideEffects: false;
};

export type ApplicationModelInvocationErrorCode =
  | "MISSING_INVOCATION_INPUT"
  | "MISSING_MODEL_INPUT"
  | "INVOKER_REJECTED";

export type ApplicationModelInvocationError = {
  code: ApplicationModelInvocationErrorCode;
  message: string;
  boundary: "input" | "invocation";
  safeForRuntimeInspection: true;
};

export type ApplicationModelInvocationResult =
  | {
      ok: true;
      invocationId: string;
      output: ApplicationModelOutput;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationModelInvocationError;
      events: readonly string[];
    };

export type ApplicationModelInvoker = (
  input: ApplicationModelInvocationInput,
) => ApplicationModelInvocationResult | Promise<ApplicationModelInvocationResult>;

export type ApplicationAdapterRequest = {
  runtimeId?: string;
  adapterId?: string;
  candidate?: ApplicationBridgeCandidate;
  compatibility?: ApplicationCompatibilityReport;
  requiredCapabilityIds?: readonly string[];
  requiredFormatIds?: readonly string[];
  requestedScopes?: readonly string[];
  allowedScopes?: readonly string[];
  contract?: ApplicationCompatibilityGate;
  governance?: ApplicationCompatibilityGate;
  invoker?: ApplicationModelInvoker;
};

export type ApplicationAdapterErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_ADAPTER_ID"
  | "MISSING_BRIDGE_CANDIDATE"
  | "RUNTIME_MISMATCH"
  | "COMPATIBILITY_REJECTED"
  | "INCOMPATIBLE_BRIDGE_CANDIDATE";

export type ApplicationAdapterError = {
  code: ApplicationAdapterErrorCode;
  message: string;
  boundary: ApplicationAdapterBoundary;
  safeForRuntimeInspection: true;
};

export type ApplicationModelAdapter = {
  kind: "agentCore.modelAdapter.applicationAdapter";
  runtimeId: string;
  adapterId: string;
  candidateId: string;
  readiness: "ready";
  capabilities: readonly ApplicationBridgeCapability[];
  formats: readonly ApplicationBridgeFormat[];
  acceptedScopes: readonly string[];
  providerPayloadCreated: false;
  unsafeSideEffects: false;
  invoke(input?: ApplicationModelInvocationInput): Promise<ApplicationModelInvocationResult>;
};

export type ApplicationAdapterResult =
  | {
      ok: true;
      adapter: ApplicationModelAdapter;
      compatibility: ApplicationCompatibilityReport;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ApplicationAdapterError;
      events: readonly string[];
    };

export const applicationAdapterDescriptor = {
  capability: "application-adapter",
  route: "agent_modelAdapter.bridgingLayer",
  purpose: "wrap a compatible abstraction-layer model candidate as agentCore's direct internal model capability",
  providerPayloadCreated: false,
  unsafeSideEffects: false,
} as const;

function isBlank(value: string | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

function failure(
  code: ApplicationAdapterErrorCode,
  message: string,
  boundary: ApplicationAdapterBoundary,
): ApplicationAdapterResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.applicationAdapter.rejected"],
  };
}

function invocationFailure(
  code: ApplicationModelInvocationErrorCode,
  message: string,
  boundary: ApplicationModelInvocationError["boundary"],
): ApplicationModelInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, safeForRuntimeInspection: true },
    events: ["modelAdapter.applicationAdapter.invocationRejected"],
  };
}

function hasModelInput(input: ApplicationModelInvocationInput): boolean {
  return Boolean(input.prompt?.trim()) || (input.messages ?? []).some((message) => message.content.trim().length > 0);
}

function candidateId(candidate: ApplicationBridgeCandidate): string {
  return candidate.bridgeId?.trim() || candidate.transformationId?.trim() || candidate.sourceInterfaceId?.trim() || "anonymous";
}

function normalizeCompatibility(
  request: ApplicationAdapterRequest,
  runtimeId: string,
): ApplicationCompatibilityReport | ApplicationAdapterResult {
  const currentCompatibility = checkApplicationModelCompatibility({
    runtimeId,
    checkId: `${request.adapterId?.trim() ?? "application-adapter"}:compatibility`,
    candidate: request.candidate,
    requiredCapabilityIds: request.requiredCapabilityIds,
    requiredFormatIds: request.requiredFormatIds,
    requestedScopes: request.requestedScopes,
    allowedScopes: request.allowedScopes,
    requireReadyBridge: true,
    contract: request.contract,
    governance: request.governance,
  });

  if (!currentCompatibility.ok) {
    return failure("COMPATIBILITY_REJECTED", currentCompatibility.error.message, currentCompatibility.error.boundary);
  }

  if (request.compatibility !== undefined) {
    if (request.compatibility.runtimeId !== runtimeId) {
      return failure("RUNTIME_MISMATCH", "application adapter compatibility belongs to a different runtime", "contract");
    }

    if (request.compatibility.candidateId !== currentCompatibility.report.candidateId) {
      return failure(
        "COMPATIBILITY_REJECTED",
        "application adapter compatibility does not belong to the bridge candidate",
        "contract",
      );
    }

    if (request.compatibility.compatible && !currentCompatibility.report.compatible) {
      return failure(
        "COMPATIBILITY_REJECTED",
        "application adapter compatibility is stale for the current bridge candidate",
        "compatibility",
      );
    }

    return request.compatibility;
  }

  return currentCompatibility.report;
}

function createInvoke(
  adapterId: string,
  candidate: ApplicationBridgeCandidate,
  invoker: ApplicationModelInvoker | undefined,
): ApplicationModelAdapter["invoke"] {
  return async (input?: ApplicationModelInvocationInput): Promise<ApplicationModelInvocationResult> => {
    if (input === undefined) {
      return invocationFailure("MISSING_INVOCATION_INPUT", "application adapter invocation requires an input envelope", "input");
    }

    if (!hasModelInput(input)) {
      return invocationFailure("MISSING_MODEL_INPUT", "application adapter invocation requires prompt or messages", "input");
    }

    const invocationId = input.invocationId?.trim() || `${adapterId}:dry-run`;

    if (invoker === undefined) {
      return {
        ok: true,
        invocationId,
        output: {
          kind: "agentCore.modelAdapter.applicationInvocationOutput",
          content: {
            candidateId: candidateId(candidate),
            status: "dry-run",
          },
          dryRun: true,
          providerPayloadCreated: false,
          unsafeSideEffects: false,
        },
        events: ["modelAdapter.applicationAdapter.dryRunInvoked"],
      };
    }

    try {
      return await invoker({ ...input, invocationId });
    } catch (error) {
      return invocationFailure(
        "INVOKER_REJECTED",
        error instanceof Error ? error.message : "application adapter invoker rejected the invocation",
        "invocation",
      );
    }
  };
}

export function createApplicationModelAdapter(request?: ApplicationAdapterRequest): ApplicationAdapterResult {
  if (request === undefined || isBlank(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "application adapter requires runtimeId", "input");
  }

  const runtimeId = (request.runtimeId ?? "").trim();
  const adapterId = request.adapterId?.trim();

  if (!adapterId) {
    return failure("MISSING_ADAPTER_ID", "application adapter requires adapterId", "input");
  }

  if (request.candidate === undefined) {
    return failure("MISSING_BRIDGE_CANDIDATE", "application adapter requires an abstraction-layer bridge candidate", "input");
  }

  if (request.candidate.runtimeId !== runtimeId) {
    return failure("RUNTIME_MISMATCH", "application adapter candidate belongs to a different runtime", "contract");
  }

  const compatibility = normalizeCompatibility(request, runtimeId);
  if ("ok" in compatibility) {
    return compatibility;
  }

  if (!compatibility.compatible) {
    return failure(
      "INCOMPATIBLE_BRIDGE_CANDIDATE",
      "application adapter only exposes bridge candidates that are usable by agentCore",
      "compatibility",
    );
  }

  return {
    ok: true,
    adapter: {
      kind: "agentCore.modelAdapter.applicationAdapter",
      runtimeId,
      adapterId,
      candidateId: compatibility.candidateId,
      readiness: "ready",
      capabilities: request.candidate.capabilities,
      formats: request.candidate.formats,
      acceptedScopes: compatibility.acceptedScopes,
      providerPayloadCreated: false,
      unsafeSideEffects: false,
      invoke: createInvoke(adapterId, request.candidate, request.invoker),
    },
    compatibility,
    events: ["modelAdapter.applicationAdapter.created"],
  };
}
