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
import {
  createDefaultRaxModelClient,
  foldRaxModelEvents,
  type RaxAuthRef,
  type RaxModelClient,
  type RaxModelEvent,
  type RaxModelRequest,
  type RaxModelResponse,
  type RaxUsage,
} from "../../modelAdapter/index.js";
import type {
  AuthEnvelope,
  ProviderAuthMaterial,
} from "../../modelAdapter/authProfileLayer/authEnvelope.js";
import {
  invokeChatGPTCodexResponses,
} from "../../modelAdapter/actualInvocationLayer/openai/chatgpt_codex_responses.js";
import type {
  OpenAIV1ResponsesProviderCaller,
  OpenAIV1ResponsesResult,
  OpenAIV1ResponsesUsage,
} from "../../modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import {
  invokeOpenAIV1Responses,
} from "../../modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import {
  invokeOpenAiV1ChatCompletions,
  type OpenAiV1ChatCompletionsInvocationResult,
  type OpenAiV1ChatCompletionsProviderCaller,
  type OpenAiV1ChatCompletionsUsage,
} from "../../modelAdapter/actualInvocationLayer/openai/v1_chat_completions.js";
import {
  invokeAnthropicV1Messages,
  type AnthropicV1MessagesInvocationResult,
  type AnthropicV1MessagesProviderCaller,
  type AnthropicV1MessagesUsage,
} from "../../modelAdapter/actualInvocationLayer/anthropic/v1_messages.js";
import {
  invokeDeepMindV1BetaModelsGenerateContent,
  type DeepMindV1BetaModelsGenerateContentResult,
  type DeepMindV1BetaModelsGenerateContentTransport,
} from "../../modelAdapter/actualInvocationLayer/deepmind/v1beta_models_generateContent.js";
import {
  redactHeaders,
  redactSecretRecord,
} from "../../modelAdapter/authProfileLayer/secretRedaction.js";
import type {
  RuntimeAuthResolver,
  RuntimeAuthResolverRequest,
} from "../runtime.authPlane/runtimeAuthResolver.js";
import type {
  RuntimeAuthModelEntry,
  RuntimeAuthProviderProfile,
} from "../runtime.authPlane/providerAuthRegistry.js";

export type ModelInvocationRuntimeMode = "single" | "stream" | "batch" | (string & {});

export type ModelInvocationRuntimeBoundary =
  | "input"
  | "contract"
  | "governance"
  | "runtime-state"
  | "prompt"
  | "capability"
  | "carrier"
  | "auth"
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
  | "AUTH_REQUIRED"
  | "AUTH_ROUTE_MISMATCH"
  | "UNSUPPORTED_PROVIDER_ROUTE"
  | "MISSING_PROVIDER"
  | "MISSING_MODEL"
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
  model?: string;
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
  raxRequest?: RaxModelRequest;
  providerBody?: unknown;
  auth?: AuthEnvelope | RaxAuthRef;
  modelClient?: RaxModelClient;
  runtimeAuthResolver?: RuntimeAuthResolver;
  authSelection?: RuntimeAuthResolverRequest;
  providerCaller?: OpenAIV1ResponsesProviderCaller;
  openaiResponsesCaller?: OpenAIV1ResponsesProviderCaller;
  openaiChatCompletionsCaller?: OpenAiV1ChatCompletionsProviderCaller;
  anthropicMessagesCaller?: AnthropicV1MessagesProviderCaller;
  geminiGenerateContentTransport?: DeepMindV1BetaModelsGenerateContentTransport;
  dryRun?: boolean;
  requiredScopes?: readonly string[];
  allowedScopes?: readonly string[];
  chatgptAccountId?: string;
  clientName?: string;
  clientVersion?: string;
  signal?: AbortSignal;
};

export type ModelInvocationProviderResult =
  (
    | OpenAIV1ResponsesResult
    | OpenAiV1ChatCompletionsInvocationResult
    | AnthropicV1MessagesInvocationResult
    | DeepMindV1BetaModelsGenerateContentResult
    | RaxModelResponse
  ) & { text?: string };

export type ModelInvocationRuntimeUsage =
  | OpenAIV1ResponsesUsage
  | OpenAiV1ChatCompletionsUsage
  | AnthropicV1MessagesUsage
  | RaxUsage;

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
      raxEvents?: readonly RaxModelEvent[];
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
  code: Extract<ModelInvocationRuntimeErrorCode, "PROVIDER_CALLER_REQUIRED" | "AUTH_REQUIRED" | "AUTH_ROUTE_MISMATCH" | "UNSUPPORTED_PROVIDER_ROUTE" | "MISSING_PROVIDER" | "MISSING_MODEL" | "PROVIDER_INVOCATION_FAILED">,
  message: string,
  boundary: ModelInvocationRuntimeBoundary,
  providerResult?: ModelInvocationProviderResult,
): RuntimeModelInvocationResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    providerResult: sanitizeProviderResult(providerResult),
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

type ModelInvocationEndpointShape = "responses" | "chat_completions" | "messages" | "gemini_generate_content" | "custom";
type RuntimeProviderProtocol = "openai" | "anthropic" | "gemini" | "custom";

function knownEndpointShape(value: string | undefined): ModelInvocationEndpointShape | undefined {
  const normalized = value?.trim().toLowerCase().replace(/[-/]/gu, "_");
  if (
    normalized === "chat_completions" ||
    normalized === "chat_completions_compat" ||
    normalized === "v1_chat_completions"
  ) {
    return "chat_completions";
  }
  if (normalized === "messages" || normalized === "anthropic_messages" || normalized === "v1_messages") return "messages";
  if (normalized === "gemini_generate_content" || normalized === "generate_content") return "gemini_generate_content";
  if (normalized === "custom") return "custom";
  if (normalized === "responses" || normalized === "openai_responses" || normalized === "v1_responses") return "responses";
  return undefined;
}

function normalizeEndpointShape(value: string | undefined): ModelInvocationEndpointShape {
  return knownEndpointShape(value) ?? "responses";
}

function explicitRequestEndpointShape(request: RuntimeModelInvocationLiveRequest): ModelInvocationEndpointShape | undefined {
  const carrierValue = request.carrier?.endpointShape ??
    metadataString(request.carrier?.metadata, "endpointShape");
  if (hasText(carrierValue)) return normalizeEndpointShape(carrierValue);
  return knownEndpointShape(request.capability?.kind);
}

function normalizeProviderIdentity(provider: string | undefined): string | undefined {
  const value = provider?.trim().toLowerCase();
  return value === undefined || value.length === 0 ? undefined : value;
}

function providerIdentitiesMatch(
  requestProvider: string | undefined,
  profileProvider: string | undefined,
  endpointShape: ModelInvocationEndpointShape | undefined,
): boolean {
  if (requestProvider === undefined || profileProvider === undefined) return true;
  if (requestProvider === profileProvider) return true;
  const requestProtocol = runtimeProviderProtocol(requestProvider) ?? runtimeProviderProtocolForEndpointShape(endpointShape);
  const profileProtocol = runtimeProviderProtocol(profileProvider) ?? runtimeProviderProtocolForEndpointShape(endpointShape);
  return requestProtocol !== undefined && requestProtocol === profileProtocol;
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/u, "");
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function authRouteMismatchMessage(
  request: RuntimeModelInvocationLiveRequest,
  profile: RuntimeAuthProviderProfile,
): string | undefined {
  const requestProvider = normalizeProviderIdentity(request.carrier?.provider);
  const profileProvider = normalizeProviderIdentity(profile.provider);
  const requestShape = explicitRequestEndpointShape(request);
  const profileShape = normalizeEndpointShape(profile.endpointShape);
  const matchShape = requestShape ?? profileShape;
  if (!providerIdentitiesMatch(requestProvider, profileProvider, matchShape)) {
    return "resolved auth profile provider does not match requested carrier provider";
  }

  if (requestShape !== undefined && requestShape !== profileShape) {
    return "resolved auth profile endpointShape does not match requested carrier endpointShape";
  }

  const requestBaseURL = normalizeBaseURL(request.carrier?.baseURL);
  const profileBaseURL = normalizeBaseURL(profile.baseURL);
  if (requestBaseURL !== undefined && profileBaseURL !== undefined && requestBaseURL !== profileBaseURL) {
    return "resolved auth profile baseURL does not match requested carrier baseURL";
  }

  return undefined;
}

function effectiveEndpointShape(
  request: RuntimeModelInvocationLiveRequest,
  profile: RuntimeAuthProviderProfile | undefined,
): ModelInvocationEndpointShape {
  return explicitRequestEndpointShape(request) ?? (profile === undefined ? "responses" : normalizeEndpointShape(profile.endpointShape));
}

function effectiveProviderName(
  request: RuntimeModelInvocationLiveRequest,
  plan: ModelInvocationPlan,
  profile: RuntimeAuthProviderProfile | undefined,
): string | undefined {
  return request.carrier?.provider?.trim() ?? plan.envelope.provider ?? profile?.provider;
}

function isChatGPTCodexResponsesRoute(request: RuntimeModelInvocationLiveRequest, carrierId: string, auth?: AuthEnvelope): boolean {
  const productChannel = metadataString(request.carrier?.metadata, "productChannel");
  const providerRoute = metadataString(request.carrier?.metadata, "providerRoute");
  return productChannel === "chatgpt-codex" ||
    providerRoute === "chatgpt_codex_responses" ||
    auth?.credentialRef?.credentialType === "chatgpt_codex_oauth" ||
    carrierId.includes("chatgpt-codex") ||
    (request.requiredScopes ?? []).some((scope) => scope.trim() === "chatgpt.codex.responses");
}

function bodyRecordOrInput(body: unknown): Record<string, unknown> {
  return isRecord(body) ? body : { input: body ?? "" };
}

function providerBodyModel(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  const value = body.model;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function geminiGenerateContentBody(body: unknown): Record<string, unknown> {
  const record = bodyRecordOrInput(body);
  const { model: _model, ...providerBody } = record;
  return providerBody;
}

function geminiApiKey(auth: AuthEnvelope): string | undefined {
  const header = auth.headerPlan.find((item) => item.name.trim().toLowerCase() === "x-goog-api-key");
  const value = header === undefined ? undefined : String(header.value).trim();
  if (value === undefined || value.length === 0) return undefined;
  return /^\[redacted(?::\d+|-empty)?\]$/u.test(value) || value === "[redacted]" ? undefined : value;
}

function publicEventName(event: string | object): string {
  if (typeof event === "string") return event;
  if ("kind" in event && typeof event.kind === "string") return event.kind;
  return "runtime.modelAdapter.modelInvocationRuntime.publicEvent";
}

function authEnvelopeForProvider(auth: AuthEnvelope, privateMaterial: ProviderAuthMaterial | undefined): AuthEnvelope {
  if (privateMaterial?.headers === undefined) return auth;
  return {
    ...auth,
    headerPlan: Object.entries(privateMaterial.headers).map(([name, value]) => ({
      name: name.trim().toLowerCase(),
      value,
      redacted: true,
    })),
  };
}

function sanitizeProviderResult<T extends ModelInvocationProviderResult | undefined>(providerResult: T): T {
  if (providerResult === undefined) return providerResult;
  if (!isRecord(providerResult)) return providerResult;

  const providerResultRecord = providerResult as Record<string, unknown>;
  const sanitized = redactSecretRecord(providerResultRecord) as Record<string, unknown>;
  const rawRequest = providerResultRecord["request"];
  const sanitizedRequest = sanitized["request"];
  if (isRecord(rawRequest)) {
    sanitized.request = {
      ...(isRecord(sanitizedRequest) ? sanitizedRequest : {}),
      ...(isRecord(rawRequest.headers)
        ? { headers: redactHeaders(rawRequest.headers as Readonly<Record<string, string>>) }
        : {}),
    };
  }

  return sanitized as T;
}

function isRuntimeAuthEnvelope(auth: AuthEnvelope | RaxAuthRef | undefined): auth is AuthEnvelope {
  return auth !== undefined && "present" in auth && "headerPlan" in auth;
}

function isRaxAuthRef(auth: AuthEnvelope | RaxAuthRef | undefined): auth is RaxAuthRef {
  return auth !== undefined && "type" in auth;
}

function raxAuthRefFromRuntimeAuth(auth: AuthEnvelope | RaxAuthRef | undefined): RaxAuthRef | undefined {
  if (auth === undefined) return undefined;
  if (isRaxAuthRef(auth)) return auth;
  if (!auth.present) return { type: "none" };
  const headers = Object.fromEntries(auth.headerPlan.map((header) => [header.name.toLowerCase(), String(header.value)]));
  const authorization = headers.authorization;
  if (auth.kind === "oauth" || auth.kind === "bearer") {
    return { type: "bearer", value: authorization?.replace(/^Bearer\s+/iu, "") };
  }
  if (auth.kind === "api-key") {
    const header = authorization === undefined ? Object.keys(headers)[0] : "Authorization";
    return { type: "api_key", header, value: authorization?.replace(/^Bearer\s+/iu, "") ?? Object.values(headers)[0] };
  }
  return { type: "none" };
}

function providerForRax(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  return normalized === "gemini" || normalized === "deepmind" ? "google" : normalized;
}

function requestFromRuntimeForRax(input: RuntimeModelInvocationLiveRequest, invocationId: string): RaxModelRequest | RuntimeModelInvocationResult {
  if (input.raxRequest !== undefined) return { ...input.raxRequest, id: invocationId };
  const provider = input.carrier?.provider?.trim();
  if (!hasText(provider)) return liveFailure("MISSING_PROVIDER", "model invocation requires a provider", "carrier");
  const model = input.carrier?.model?.trim() ?? providerBodyModel(input.providerBody);
  if (!hasText(model)) return liveFailure("MISSING_MODEL", "model invocation requires a model id", "carrier");
  const body = bodyRecordOrInput(input.providerBody);
  const route = metadataString(input.carrier?.metadata, "modelAdapterRouteId") ??
    metadataString(input.carrier?.metadata, "raxRouteId") ??
    (input.carrier?.carrierId === provider ? input.carrier.carrierId : undefined);
  return {
    id: invocationId,
    model: {
      provider: providerForRax(provider),
      model,
      ...(route !== undefined ? { route } : {}),
      baseUrl: input.carrier?.baseURL,
      auth: raxAuthRefFromRuntimeAuth(input.auth),
    },
    messages: [{ role: "user", content: typeof input.providerBody === "string" ? input.providerBody : String(body.input ?? "") }],
    providerOptions: { native: body },
  };
}

async function invokeThroughRaxModelClient(
  request: RuntimeModelInvocationLiveRequest,
  plan: ModelInvocationPlan,
): Promise<RuntimeModelInvocationResult> {
  const raxRequest = requestFromRuntimeForRax(request, plan.invocationId);
  if ("ok" in raxRequest) return raxRequest;
  try {
    const client = request.modelClient ?? createDefaultRaxModelClient();
    const events: RaxModelEvent[] = [];
    for await (const event of client.stream(raxRequest)) events.push(event);
    const response = foldRaxModelEvents(events);
    return {
      ok: true,
      plan: {
        ...plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult: response,
      usage: response.usage,
      raw: response,
      raxEvents: events,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", "runtime.modelAdapter.modelInvocationRuntime.planned"],
    };
  } catch (error) {
    return liveFailure(
      "PROVIDER_INVOCATION_FAILED",
      error instanceof Error ? error.message : String(error),
      "runtime-state",
    );
  }
}

function shouldUseRaxModelClient(request: RuntimeModelInvocationLiveRequest): boolean {
  return request.raxRequest !== undefined || request.modelClient !== undefined;
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

  if (shouldUseRaxModelClient(request)) {
    return invokeThroughRaxModelClient(request, planResult.plan);
  }

  let auth = isRuntimeAuthEnvelope(request.auth) ? request.auth : undefined;
  let providerAuth = auth;
  let resolvedAuthProfile: RuntimeAuthProviderProfile | undefined;
  let resolvedAuthModelEntry: RuntimeAuthModelEntry | undefined;
  let authEvents: readonly (string | object)[] = [];
  if (auth === undefined && request.runtimeAuthResolver !== undefined && request.authSelection !== undefined) {
    const resolvedAuth = await request.runtimeAuthResolver.resolve(request.authSelection);
    if (!resolvedAuth.ok) {
      return liveFailure("AUTH_REQUIRED", resolvedAuth.error.message, "auth");
    }
    auth = resolvedAuth.value.auth;
    providerAuth = authEnvelopeForProvider(resolvedAuth.value.auth, resolvedAuth.value.resolved.privateMaterial);
    resolvedAuthProfile = resolvedAuth.value.providerProfile;
    resolvedAuthModelEntry = resolvedAuth.value.modelEntry;
    authEvents = resolvedAuth.events;
  }
  if (auth === undefined || auth.present !== true) {
    return liveFailure("AUTH_REQUIRED", "model invocation live call requires resolved auth material", "auth");
  }
  providerAuth ??= auth;

  if (resolvedAuthProfile !== undefined) {
    const mismatch = authRouteMismatchMessage(request, resolvedAuthProfile);
    if (mismatch !== undefined) {
      return liveFailure("AUTH_ROUTE_MISMATCH", mismatch, "auth");
    }
  }

  const endpointShape = effectiveEndpointShape(request, resolvedAuthProfile);
  const provider = effectiveProviderProtocol(effectiveProviderName(request, planResult.plan, resolvedAuthProfile), endpointShape);
  const baseURL = request.carrier?.baseURL ?? resolvedAuthProfile?.baseURL;
  const carrierId = request.carrier?.carrierId?.trim() ?? planResult.plan.envelope.carrierId;
  if (provider === "openai" && endpointShape === "responses" && isChatGPTCodexResponsesRoute(request, carrierId, auth)) {
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
      auth: providerAuth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "chatgpt.codex.responses"],
      allowedScopes: request.allowedScopes,
      chatgptAccountId: request.chatgptAccountId,
      clientName: request.clientName,
      clientVersion: request.clientVersion,
      expectResponseObject: false,
      signal: request.signal,
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
      providerResult: sanitizeProviderResult(providerResult),
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...authEvents.map(publicEventName), ...providerResult.events],
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
      baseUrl: baseURL,
      endpointPath: "/v1/responses",
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: providerAuth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "openai.responses"],
      allowedScopes: request.allowedScopes,
      expectResponseObject: false,
      signal: request.signal,
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
      providerResult: sanitizeProviderResult(providerResult),
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...authEvents.map(publicEventName), ...providerResult.events],
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
      baseUrl: baseURL,
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      auth: providerAuth,
      trace: { correlationId: planResult.plan.invocationId, callerId: planResult.plan.caller.id },
      caller,
      signal: request.signal,
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
      providerResult: sanitizeProviderResult(providerResult),
      usage: providerResult.envelope.usage,
      raw: providerResult.envelope.rawResponse,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...authEvents.map(publicEventName), ...providerResult.events],
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
      auth: providerAuth,
      headers: { "content-type": "application/json" },
      body: request.providerBody,
      caller,
      requiredScopes: request.requiredScopes ?? ["model.invoke", "anthropic.messages"],
      allowedScopes: request.allowedScopes,
      expectResponseObject: false,
      signal: request.signal,
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
      providerResult: sanitizeProviderResult(providerResult),
      usage: providerResult.response.usage,
      raw: providerResult.response.raw,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...authEvents.map(publicEventName), ...providerResult.events],
    };
  }

  if (provider === "gemini" && endpointShape === "gemini_generate_content") {
    const transport = request.geminiGenerateContentTransport;
    if (transport === undefined) {
      return liveFailure(
        "PROVIDER_CALLER_REQUIRED",
        "Gemini generateContent invocation requires an injected transport",
        "carrier",
      );
    }
    const apiKey = geminiApiKey(providerAuth);
    if (apiKey === undefined) {
      return liveFailure(
        "AUTH_REQUIRED",
        "Gemini generateContent live invocation requires private x-goog-api-key auth material from runtimeAuthResolver",
        "auth",
      );
    }

    const providerResult = await invokeDeepMindV1BetaModelsGenerateContent({
      baseUrl: baseURL,
      apiKey,
      model: providerBodyModel(request.providerBody) ?? resolvedAuthModelEntry?.model,
      body: geminiGenerateContentBody(request.providerBody),
      dryRun: false,
      governance: request.governance,
      contract: request.contract,
      runtime: {
        runtimeId: planResult.plan.runtimeId,
        invocationId: planResult.plan.invocationId,
        traceId: planResult.plan.caller.id,
      },
      transport,
      signal: request.signal,
    });

    if (!providerResult.ok) {
      return liveFailure(
        "PROVIDER_INVOCATION_FAILED",
        providerResult.error.message,
        providerResult.error.boundary === "input" ? "carrier" : "runtime-state",
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
      providerResult: sanitizeProviderResult(providerResult),
      raw: providerResult.response.body,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events, ...authEvents.map(publicEventName), ...providerResult.events],
    };
  }

  return liveFailure(
    "UNSUPPORTED_PROVIDER_ROUTE",
    "model invocation route is not supported by the current runtime provider adapter",
    "carrier",
  );
}

function runtimeProviderProtocol(provider: string | undefined): RuntimeProviderProtocol | undefined {
  const value = provider?.trim().toLowerCase();
  if (value === "openai" || value === "openai-compatible") return "openai";
  if (value === "anthropic" || value === "anthropic-compatible") return "anthropic";
  if (value === "gemini" || value === "deepmind" || value === "google") return "gemini";
  if (value === "custom") return "custom";
  return undefined;
}

function runtimeProviderProtocolForEndpointShape(shape: ModelInvocationEndpointShape | undefined): RuntimeProviderProtocol | undefined {
  if (shape === "responses" || shape === "chat_completions") return "openai";
  if (shape === "messages") return "anthropic";
  if (shape === "gemini_generate_content") return "gemini";
  if (shape === "custom") return "custom";
  return undefined;
}

function effectiveProviderProtocol(
  provider: string | undefined,
  endpointShape: ModelInvocationEndpointShape,
): RuntimeProviderProtocol | undefined {
  return runtimeProviderProtocol(provider) ?? runtimeProviderProtocolForEndpointShape(endpointShape);
}
