/*
 * 文件定位：Agent 运行态实现层 / 模型调用运行态。
 * 核心目的：把 runtime 的治理/计划壳接到新的 RaxModelRequest/provider route 调用层。
 * 边界：这里不再直连 OpenAI/Anthropic/Gemini 端点实现；provider 字段形状归 src/modelAdapter。
 * 对接：上接 application/runtime kernel，下接 modelAdapter 的 RaxModelClient、provider route 和事件折叠。
 * 实现提示：先保留 dry-run 计划面，再通过可注入 modelClient 打开真实 provider 调用。
 */

import {
  defaultRaxModelClient,
  foldRaxModelEvents,
  type RaxAuthRef,
  type RaxModelClient,
  type RaxModelEvent,
  type RaxModelRequest,
  type RaxModelResponse,
  type RaxUsage,
} from "../../modelAdapter/index.js";
import type { AuthEnvelope } from "../../modelAdapter/authProfileLayer/authEnvelope.js";
import type {
  ModelAdapterRuntimeCaller,
  ModelAdapterRuntimeGate,
} from "./modelAdapterRuntime.js";

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
  | "MISSING_PROVIDER"
  | "MISSING_MODEL"
  | "RUNTIME_NOT_READY"
  | "CONTRACT_REJECTED"
  | "GOVERNANCE_REJECTED"
  | "UNSAFE_INVOCATION_DISABLED"
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
  auth?: RaxAuthRef | AuthEnvelope;
  modelClient?: RaxModelClient;
  dryRun?: boolean;
  runtimeAuthResolver?: unknown;
  authSelection?: unknown;
  providerCaller?: unknown;
  openaiResponsesCaller?: unknown;
  openaiChatCompletionsCaller?: unknown;
  anthropicMessagesCaller?: unknown;
  geminiGenerateContentTransport?: unknown;
  clientName?: string;
  clientVersion?: string;
  signal?: AbortSignal;
};

export type ModelInvocationRuntimeUsage = RaxUsage;
export type ModelInvocationProviderResult = RaxModelResponse;

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
  if (moduleId !== undefined && moduleId.length > 0) normalized.moduleId = moduleId;
  const sessionId = caller.sessionId?.trim();
  if (sessionId !== undefined && sessionId.length > 0) normalized.sessionId = sessionId;
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

export function planModelInvocation(request?: ModelInvocationRuntimeRequest): ModelInvocationRuntimeResult {
  if (request === undefined || !hasText(request.runtimeId)) {
    return failure("MISSING_RUNTIME_ID", "model invocation runtime requires a runtimeId", "input");
  }
  if (request.caller === undefined || !hasText(request.caller.id)) {
    return failure("MISSING_CALLER", "model invocation runtime requires a caller", "input");
  }
  if (request.runtimeReady === false) {
    return failure("RUNTIME_NOT_READY", "model invocation can only be planned through a ready runtime host", "runtime-state");
  }
  if (request.contract?.accepted === false) {
    return failure("CONTRACT_REJECTED", request.contract.reason ?? "model invocation runtime was rejected by contract surface", "contract");
  }
  if (request.governance?.accepted === false) {
    return failure("GOVERNANCE_REJECTED", request.governance.reason ?? "model invocation runtime was rejected by governance", "governance");
  }
  if (request.allowProviderCall === true) {
    return failure("UNSAFE_INVOCATION_DISABLED", "model invocation plan is dry-run only; use invokeModelThroughRuntime for provider calls", "side-effect");
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
    return failure("MISSING_CARRIER_ID", "model invocation runtime requires a carrier id", "carrier");
  }

  const runtimeId = request.runtimeId.trim();
  const loweringId = request.loweredPrompt.loweringId.trim();
  const invocationId = hasText(request.invocationId) ? request.invocationId.trim() : `${runtimeId}:modelInvocation:${loweringId}`;
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
  if (promptPackId !== undefined && promptPackId.length > 0) envelope.promptPackId = promptPackId;
  if (capabilityKind !== undefined && capabilityKind.length > 0) envelope.capabilityKind = capabilityKind;
  if (provider !== undefined && provider.length > 0) envelope.provider = provider;

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
  code: Extract<ModelInvocationRuntimeErrorCode, "MISSING_PROVIDER" | "MISSING_MODEL" | "PROVIDER_INVOCATION_FAILED" | "UNSAFE_INVOCATION_DISABLED">,
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

function requestFromRuntime(input: RuntimeModelInvocationLiveRequest, invocationId: string): RaxModelRequest | RuntimeModelInvocationResult {
  if (input.raxRequest !== undefined) return { ...input.raxRequest, id: invocationId };
  const provider = input.carrier?.provider?.trim();
  if (!hasText(provider)) return liveFailure("MISSING_PROVIDER", "model invocation requires a provider", "carrier");
  const model = input.carrier?.model?.trim() ?? (typeof input.providerBody === "object" && input.providerBody !== null && "model" in input.providerBody
    ? String((input.providerBody as { model?: unknown }).model ?? "")
    : "");
  if (!hasText(model)) return liveFailure("MISSING_MODEL", "model invocation requires a model id", "carrier");
  const body = typeof input.providerBody === "object" && input.providerBody !== null ? input.providerBody as Record<string, unknown> : {};
  return {
    id: invocationId,
    model: {
      provider,
      model,
      route: input.carrier?.carrierId,
      baseUrl: input.carrier?.baseURL,
      auth: raxAuthRefFromRuntimeAuth(input.auth),
    },
    messages: [{ role: "user", content: typeof input.providerBody === "string" ? input.providerBody : String(body.input ?? "") }],
    providerOptions: { native: body },
  };
}

function raxAuthRefFromRuntimeAuth(auth: RaxAuthRef | AuthEnvelope | undefined): RaxAuthRef | undefined {
  if (auth === undefined) return undefined;
  if ("type" in auth) return auth;
  if (!auth.present) return { type: "none" };
  const headers = Object.fromEntries(auth.headerPlan.map((header) => [header.name.toLowerCase(), String(header.value)]));
  const authorization = headers.authorization;
  if (auth.kind === "oauth" || auth.kind === "bearer") {
    return { type: "bearer", value: authorization?.replace(/^Bearer\\s+/iu, "") };
  }
  if (auth.kind === "api-key") {
    const header = authorization === undefined ? Object.keys(headers)[0] : "Authorization";
    return { type: "api_key", header, value: authorization?.replace(/^Bearer\\s+/iu, "") ?? Object.values(headers)[0] };
  }
  return { type: "none" };
}

export async function invokeModelThroughRuntime(
  request: RuntimeModelInvocationLiveRequest = {},
): Promise<RuntimeModelInvocationResult> {
  const planResult = planModelInvocation({ ...request, allowProviderCall: false });
  if (!planResult.ok) return planResult;

  if (request.dryRun !== false) {
    return {
      ok: true,
      plan: planResult.plan,
      raw: null,
      events: ["runtime.modelAdapter.modelInvocationRuntime.dryRun", ...planResult.events],
    };
  }
  if (request.allowProviderCall !== true) {
    return liveFailure("UNSAFE_INVOCATION_DISABLED", "model invocation live call requires allowProviderCall: true", "side-effect");
  }

  const raxRequest = requestFromRuntime(request, planResult.plan.invocationId);
  if ("ok" in raxRequest) return raxRequest;
  try {
    const client = request.modelClient ?? defaultRaxModelClient;
    const events: RaxModelEvent[] = [];
    for await (const event of client.stream(raxRequest)) events.push(event);
    const response = foldRaxModelEvents(events);
    return {
      ok: true,
      plan: {
        ...planResult.plan,
        providerCallPermitted: true,
        transport: "provider",
        dryRun: false,
      },
      providerResult: response,
      usage: response.usage,
      raw: response,
      raxEvents: events,
      events: ["runtime.modelAdapter.modelInvocationRuntime.called", ...planResult.events],
    };
  } catch (error) {
    return liveFailure(
      "PROVIDER_INVOCATION_FAILED",
      error instanceof Error ? error.message : String(error),
      "runtime-state",
    );
  }
}
