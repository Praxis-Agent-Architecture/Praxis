/*
 * 文件定位：Agent 运行态实现层 / 模型适配运行态绑定面。
 * 核心目的：承载 model Invocation Runtime 这一能力位点。
 * 能力要求1：需要把文件名表达的能力落实成清晰的类型、输入输出和最小行为。
 * 能力要求2：如果后续发现语义不足，应优先补接口契约，而不是把逻辑散落到相邻文件。
 * 边界：承托和治理运行态，不吞并执行引擎、模型适配器或官方模块内部实现。
 * 对接：需要服务 applicationSurface、officialModuleSurface、governancePlane、invocationMethod 和 inspection/debug 等运行面。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import type {
  ModelAdapterRuntimeCaller,
  ModelAdapterRuntimeGate,
} from "./modelAdapterRuntime.js";
import type { AuthEnvelope } from "../../agentCore_modelAdapter/authProfileLayer/authEnvelope.js";
import {
  invokeChatGPTCodexResponses,
} from "../../agentCore_modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import type {
  OpenAIV1ResponsesProviderCaller,
  OpenAIV1ResponsesResult,
  OpenAIV1ResponsesUsage,
} from "../../agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import {
  invokeOpenAIV1Responses,
} from "../../agentCore_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import {
  invokeOpenAiV1ChatCompletions,
  type OpenAiV1ChatCompletionsInvocationResult,
  type OpenAiV1ChatCompletionsProviderCaller,
  type OpenAiV1ChatCompletionsUsage,
} from "../../agentCore_modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";
import {
  invokeAnthropicV1Messages,
  type AnthropicV1MessagesInvocationResult,
  type AnthropicV1MessagesProviderCaller,
  type AnthropicV1MessagesUsage,
} from "../../agentCore_modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";

export type ModelInvocationRuntimeMode = "single" | "stream" | "batch" | (string & {});

export type ModelInvocationRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "prompt"
  | "capability"
  | "carrier"
  | "side-effect";

export type ModelInvocationRuntimeErrorCode =
  | "MISSING_RUNTIME_ID"
  | "MISSING_CALLER"
  | "MISSING_LOWERED_PROMPT"
  | "MISSING_LOWERING_ID"
  | "MISSING_CAPABILITY"
  | "MISSING_CAPABILITY_ID"
  | "MISSING_CARRIER"
  | "MISSING_CARRIER_ID"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSAFE_INVOCATION_DISABLED"
  | "PROVIDER_CALLER_REQUIRED"
  | "UNSUPPORTED_PROVIDER_ROUTE"
  | "PROVIDER_INVOCATION_FAILED";

export type ModelInvocationRuntimeError = {
  code: ModelInvocationRuntimeErrorCode;
  message: string;
  boundary: ModelInvocationRuntimeBoundary;
  publicSafe: true;
};

export type ModelInvocationPromptRef = {
  loweringId?: string;
  promptPackId?: string;
  materialRefs?: readonly string[];
};

export type ModelInvocationCapabilityRef = {
  capabilityId?: string;
  kind?: string;
};

export type ModelInvocationCarrierRef = {
  carrierId?: string;
  provider?: string;
  endpointShape?: string;
  baseURL?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ModelInvocationRuntimeRequest = {
  runtimeId?: string;
  caller?: ModelAdapterRuntimeCaller;
  invocationId?: string;
  loweredPrompt?: ModelInvocationPromptRef;
  capability?: ModelInvocationCapabilityRef;
  carrier?: ModelInvocationCarrierRef;
  mode?: ModelInvocationRuntimeMode;
  runtimeReady?: boolean;
  allowProviderCall?: boolean;
  contract?: ModelAdapterRuntimeGate;
  governance?: ModelAdapterRuntimeGate;
  metadata?: Readonly<Record<string, unknown>>;
};

export type RuntimeModelInvocationLiveRequest = ModelInvocationRuntimeRequest & {
  providerBody?: unknown;
  auth?: AuthEnvelope;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  openaiResponsesCaller?: OpenAIV1ResponsesProviderCaller;
  openaiChatCompletionsCaller?: OpenAiV1ChatCompletionsProviderCaller;
  anthropicMessagesCaller?: AnthropicV1MessagesProviderCaller;
  dryRun?: boolean;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  chatgptAccountId?: string;
  clientName?: string;
  clientVersion?: string;
};

export type ModelInvocationProviderResult =
  | OpenAIV1ResponsesResult
  | OpenAiV1ChatCompletionsInvocationResult
  | AnthropicV1MessagesInvocationResult;

export type ModelInvocationRuntimeUsage =
  | OpenAIV1ResponsesUsage
  | OpenAiV1ChatCompletionsUsage
  | AnthropicV1MessagesUsage;

export type ModelInvocationMockableEnvelope = {
  loweringId: string;
  promptPackId?: string;
  materialRefs: readonly string[];
  capabilityId: string;
  capabilityKind?: string;
  carrierId: string;
  provider?: string;
  mode: ModelInvocationRuntimeMode;
};

export type ModelInvocationPlan = {
  invocationId: string;
  runtimeId: string;
  caller: ModelAdapterRuntimeCaller;
  route: "runtime.modelAdapter.modelInvocationRuntime";
  envelope: ModelInvocationMockableEnvelope;
  providerCallPermitted: boolean;
  transport: "mockable-envelope" | "provider";
  metadata: Readonly<Record<string, unknown>>;
  contractChecked: true;
  governanceChecked: true;
  dryRun: boolean;
  unsafeSideEffects: false;
};

export type ModelInvocationRuntimeResult =
  | {
      ok: true;
      plan: ModelInvocationPlan;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelInvocationRuntimeError;
      events: readonly string[];
    };

export type RuntimeModelInvocationResult =
  | {
      ok: true;
      plan: ModelInvocationPlan;
      providerResult?: ModelInvocationProviderResult;
      usage?: ModelInvocationRuntimeUsage;
      raw: unknown;
      events: readonly string[];
    }
  | {
      ok: false;
      error: ModelInvocationRuntimeError;
      providerResult?: ModelInvocationProviderResult;
      events: readonly string[];
    };

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCaller(caller: ModelAdapterRuntimeCaller): ModelAdapterRuntimeCaller {
  const normalized: ModelAdapterRuntimeCaller = {
    kind: caller.kind,
    id: caller.id.trim(),
  };

  const moduleId = caller.moduleId?.trim();
  if (moduleId !== undefined && moduleId.length > 0) {
    normalized.moduleId = moduleId;
  }

  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) {
    normalized.sessionId = sessionId;
  }

  return normalized;
}

function failure(
  code: ModelInvocationRuntimeErrorCode,
  message: string,
  boundary: ModelInvocationRuntimeBoundary,
): ModelInvocationRuntimeResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.modelAdapter.modelInvocationRuntime.rejected"],
  };
}

export function planModelInvocation(
  request?: ModelInvocationRuntimeRequest,
): ModelInvocationRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "model invocation runtime requires a runtimeId", "input");
  }

  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "model invocation runtime requires a caller", "input");
  }

  if (request.runtimeReady === false) {
    return failure(
      "RUNTIME_NOT_READY",
      "model invocation can only be planned through a ready runtime host",
      "runtime-state",
    );
  }

  if (request.contract?.accepted === false) {
    return failure(
      "CONTRACT_REJECTED",
      request.contract.reason ?? "model invocation runtime was rejected by contract surface",
      "contract",
    );
  }

  if (request.governance?.accepted === false) {
    return failure(
      "GOVERNANCE_REJECTED",
      request.governance.reason ?? "model invocation runtime was rejected by governance",
      "governance",
    );
  }

  if (request.allowProviderCall === true) {
    return failure(
      "UNSAFE_INVOCATION_DISABLED",
      "model invocation runtime first pass only builds a dry-run, mockable envelope",
      "side-effect",
    );
  }

  if (request.loweredPrompt === undefined) {
    return failure("MISSING_LOWERED_PROMPT", "model invocation runtime requires a lowered prompt envelope", "prompt");
  }

  if (!hasText(request.loweredPrompt.loweringId)) {
    return failure("MISSING_LOWERING_ID", "model invocation runtime requires a lowering id", "prompt");
  }

  if (request.capability === undefined) {
    return failure("MISSING_CAPABILITY", "model invocation runtime requires a bridged capability", "capability");
  }

  if (!hasText(request.capability.capabilityId)) {
    return failure("MISSING_CAPABILITY_ID", "model invocation runtime requires a capability id", "capability");
  }

  if (request.carrier === undefined) {
    return failure("MISSING_CARRIER", "model invocation runtime requires a provider carrier reference", "carrier");
  }

  if (!hasText(request.carrier.carrierId)) {
    return failure("MISSING_CARRIER_ID", "model invocation runtime requires a provider carrier id", "carrier");
  }

  const runtimeId = request.runtimeId.trim();
  const loweringId = request.loweredPrompt.loweringId.trim();
  const invocationId = hasText(request.invocationId)
    ? request.invocationId.trim()
    : `${runtimeId}:modelInvocation:${loweringId}`;
  const mode = request.mode?.trim();
  const promptPackId = request.loweredPrompt.promptPackId?.trim();
  const capabilityKind = request.capability.kind?.trim();
  const provider = request.carrier.provider?.trim();
  const envelope: ModelInvocationMockableEnvelope = {
    loweringId,
    materialRefs: cleanList(request.loweredPrompt.materialRefs),
    capabilityId: request.capability.capabilityId.trim(),
    carrierId: request.carrier.carrierId.trim(),
    mode: mode !== undefined && mode.length > 0 ? mode : "single",
  };

  if (promptPackId !== undefined && promptPackId.length > 0) {
    envelope.promptPackId = promptPackId;
  }

  if (capabilityKind !== undefined && capabilityKind.length > 0) {
    envelope.capabilityKind = capabilityKind;
  }

  if (provider !== undefined && provider.length > 0) {
    envelope.provider = provider;
  }

  return {
    ok: true,
    plan: {
      invocationId,
      runtimeId,
      caller: normalizeCaller(request.caller),
      route: "runtime.modelAdapter.modelInvocationRuntime",
      envelope,
      providerCallPermitted: false,
      transport: "mockable-envelope",
      metadata: request.metadata ?? {},
      contractChecked: true,
      governanceChecked: true,
      dryRun: true,
      unsafeSideEffects: false,
    },
    events: ["runtime.modelAdapter.modelInvocationRuntime.planned"],
  };
}

function liveFailure(
  code: Extract<
    ModelInvocationRuntimeErrorCode,
    "PROVIDER_CALLER_REQUIRED" | "UNSUPPORTED_PROVIDER_ROUTE" | "PROVIDER_INVOCATION_FAILED"
  >,
  message: string,
  boundary: ModelInvocationRuntimeBoundary,
  providerResult?: ModelInvocationProviderResult,
): RuntimeModelInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    providerResult,
    events: ["runtime.modelAdapter.modelInvocationRuntime.rejected"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataString(metadata: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeEndpointShape(value: string | undefined): "responses" | "chat_completions" | "messages" | "custom" {
  const normalized = value?.trim().toLowerCase().replace(/[-/]/gu, "_");
  if (
    normalized === "chat_completions" ||
    normalized === "chat_completions_compat" ||
    normalized === "v1_chat_completions"
  ) {
    return "chat_completions";
  }
  if (normalized === "messages" || normalized === "anthropic_messages" || normalized === "v1_messages") return "messages";
  if (normalized === "custom") return "custom";
  return "responses";
}

function requestEndpointShape(request: RuntimeModelInvocationLiveRequest): "responses" | "chat_completions" | "messages" | "custom" {
  return normalizeEndpointShape(
    request.carrier?.endpointShape ??
    metadataString(request.carrier?.metadata, "endpointShape") ??
    request.capability?.kind,
  );
}

function isChatGPTCodexResponsesRoute(request: RuntimeModelInvocationLiveRequest, carrierId: string): boolean {
  const productChannel = metadataString(request.carrier?.metadata, "productChannel");
  const providerRoute = metadataString(request.carrier?.metadata, "providerRoute");
  return productChannel === "chatgpt-codex" ||
    providerRoute === "chatgpt_codex_responses" ||
    request.auth?.credentialRef?.credentialType === "chatgpt_codex_oauth" ||
    carrierId.includes("chatgpt-codex") ||
    (request.requiredScopes ?? []).some((scope) => scope.trim() === "chatgpt.codex.responses");
}

function bodyRecordOrInput(body: unknown): Record<string, unknown> {
  return isRecord(body) ? body : { input: body ?? "" };
}

export async function invokeModelThroughRuntime(
  request: RuntimeModelInvocationLiveRequest = {},
): Promise<RuntimeModelInvocationResult> {
  const planResult = planModelInvocation({
    ...request,
    allowProviderCall: false,
  });

  if (!planResult.ok) {
    return planResult;
  }

  if (request.dryRun !== false) {
    return {
      ok: true,
      plan: planResult.plan,
      raw: null,
      events: ["runtime.modelAdapter.modelInvocationRuntime.dryRun", ...planResult.events],
    };
  }

  if (request.allowProviderCall !== true) {
    return {
      ok: false,
      error: {
        code: "UNSAFE_INVOCATION_DISABLED",
        message: "model invocation live call requires allowProviderCall: true",
        boundary: "side-effect",
        publicSafe: true,
      },
      events: ["runtime.modelAdapter.modelInvocationRuntime.rejected"],
    };
  }

  const provider = request.carrier?.provider?.trim() ?? planResult.plan.envelope.provider;
  const endpointShape = requestEndpointShape(request);
  const carrierId = request.carrier?.carrierId?.trim() ?? planResult.plan.envelope.carrierId;
  if (provider === "openai" && endpointShape === "responses" && isChatGPTCodexResponsesRoute(request, carrierId)) {
    const caller = request.providerCaller ?? request.openaiResponsesCaller;
    if (caller === undefined) {
      return liveFailure(
        "PROVIDER_CALLER_REQUIRED",
        "ChatGPT Codex responses invocation requires an injected provider caller",
        "carrier",
      );
    }

    const providerResult = await invokeChatGPTCodexResponses({
      operation: "create",
      runtime: {
        runtimeId: planResult.plan.runtimeId,
        invocationId: planResult.plan.invocationId,
        callerId: planResult.plan.caller.id,
      },
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: request.auth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "chatgpt.codex.responses"],
      allowedScopes: request.allowedScopes,
      chatgptAccountId: request.chatgptAccountId,
      clientName: request.clientName,
      clientVersion: request.clientVersion,
      expectResponseObject: false,
    });

    if (!providerResult.ok) {
      return liveFailure(
        "PROVIDER_INVOCATION_FAILED",
        providerResult.error.message,
        providerResult.error.boundary === "auth" ? "carrier" : "runtime-state",
        providerResult,
      );
    }

    return {
      ok: true,
      plan: {
        ...planResult.plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult,
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...providerResult.events],
    };
  }

  if (provider === "openai" && endpointShape === "responses") {
    const caller = request.openaiResponsesCaller ?? request.providerCaller;
    if (caller === undefined) {
      return liveFailure(
        "PROVIDER_CALLER_REQUIRED",
        "OpenAI v1 responses invocation requires an injected provider caller",
        "carrier",
      );
    }

    const providerResult = await invokeOpenAIV1Responses({
      operation: "create",
      runtime: {
        runtimeId: planResult.plan.runtimeId,
        invocationId: planResult.plan.invocationId,
        callerId: planResult.plan.caller.id,
      },
      baseUrl: request.carrier?.baseURL,
      endpointPath: "/v1/responses",
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: request.auth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "openai.responses"],
      allowedScopes: request.allowedScopes,
      expectResponseObject: false,
    });

    if (!providerResult.ok) {
      return liveFailure(
        "PROVIDER_INVOCATION_FAILED",
        providerResult.error.message,
        providerResult.error.boundary === "auth" ? "carrier" : "runtime-state",
        providerResult,
      );
    }

    return {
      ok: true,
      plan: {
        ...planResult.plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult,
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...providerResult.events],
    };
  }

  if (provider === "openai" && endpointShape === "chat_completions") {
    const caller = request.openaiChatCompletionsCaller;
    if (caller === undefined) {
      return liveFailure(
        "PROVIDER_CALLER_REQUIRED",
        "OpenAI v1 chat completions invocation requires an injected provider caller",
        "carrier",
      );
    }

    const providerResult = await invokeOpenAiV1ChatCompletions({
      requestBody: bodyRecordOrInput(request.providerBody),
      baseUrl: request.carrier?.baseURL,
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: request.auth,
      trace: { correlationId: planResult.plan.invocationId, callerId: planResult.plan.caller.id },
      caller,
    });

    if (!providerResult.ok) {
      return liveFailure(
        "PROVIDER_INVOCATION_FAILED",
        providerResult.error.message,
        providerResult.error.boundary === "provider" ? "runtime-state" : providerResult.error.boundary,
        providerResult,
      );
    }

    return {
      ok: true,
      plan: {
        ...planResult.plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult,
      usage: providerResult.envelope.usage,
      raw: providerResult.envelope.rawResponse,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...providerResult.events],
    };
  }

  if (provider === "anthropic" && endpointShape === "messages") {
    const caller = request.anthropicMessagesCaller;
    if (caller === undefined) {
      return liveFailure(
        "PROVIDER_CALLER_REQUIRED",
        "Anthropic v1 messages invocation requires an injected provider caller",
        "carrier",
      );
    }

    const providerResult = await invokeAnthropicV1Messages({
      operation: "create",
      runtime: {
        runtimeId: planResult.plan.runtimeId,
        correlationId: planResult.plan.invocationId,
        callerId: planResult.plan.caller.id,
      },
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: request.auth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "anthropic.messages"],
      allowedScopes: request.allowedScopes,
      expectResponseObject: false,
    });

    if (!providerResult.ok) {
      return liveFailure(
        "PROVIDER_INVOCATION_FAILED",
        providerResult.error.message,
        providerResult.error.boundary === "auth" ? "carrier" : "runtime-state",
        providerResult,
      );
    }

    return {
      ok: true,
      plan: {
        ...planResult.plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult,
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...providerResult.events],
    };
  }

  return liveFailure(
    "UNSUPPORTED_PROVIDER_ROUTE",
    "model invocation route is not supported by the current runtime provider adapter",
    "carrier",
  );
}
