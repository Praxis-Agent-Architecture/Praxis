/*
 * 文件定位：Agent 运行态实现层 / OAO AgentManifest 编译面。
 * 核心目的：把 PraxisAgent class 或 instance 编译为 runtime 只读执行合同。
 * 能力要求1：支持 class 与 instance 两种 OAO authoring 输入，并生成稳定 manifestHash。
 * 能力要求2：Harness 保持声明式，runtime 后续只执行 AgentManifest，不直接执行 Agent class 内部逻辑。
 * 边界：只定义 agent 编译合同，不启动进程、不读取文件、不调用模型、不执行工具。
 * 对接：需要服务 PraxisRuntimeKernel、runtime.invocationMethod、runtime.modelAdapter 和 runtime.execEngine。
 * 实现提示：先保证最小可运行字段、稳定 hash、public-safe 错误，再等待 promptPack/mainLoop 设计加厚。
 */

import { createHash } from "node:crypto";

import type { CredentialRef } from "../agent_modelAdapter/authProfileLayer/credentialRef.js";
import type { ProviderReasoningConfig } from "../agent_modelAdapter/providerAccessLayer/providerCarrier.js";

export type AgentIdentity = string | {
  id: string;
  name?: string;
  version?: string;
  description?: string;
};

export type ModelSpec = {
  provider: "openai" | "anthropic" | "deepmind" | "customFormat" | (string & {});
  model: string;
  endpointShape?: "responses" | "messages" | "custom" | (string & {});
  carrierId?: string;
  credentialRef?: CredentialRef;
  reasoning?: ProviderReasoningConfig;
  baseURL?: string;
  clientName?: string;
  clientVersion?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ToolSpec = {
  toolId: string;
  family?: string;
  description?: string;
  inputSchema?: Readonly<Record<string, unknown>>;
  scopes?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type PolicySpec = {
  scopes?: readonly string[];
  allowedTools?: readonly string[];
  requireApproval?: readonly string[];
  allowProviderCall?: boolean;
  allowToolExecution?: boolean;
  workspaceRoot?: string;
  allowedRoots?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type LoopSpec = {
  strategy: "single" | "tool-calling-v1" | "custom" | (string & {});
  maxModelTurns?: number;
  maxToolCalls?: number;
  metadata?: Readonly<Record<string, unknown>>;
};

export type ContextSpec = {
  refs?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type MemorySpec = {
  mode?: "none" | "session" | "longTerm" | (string & {});
  pool?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type StorageSpec = {
  kind?: "memory" | "sqlite" | (string & {});
  path?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PromptPackSpec = {
  promptPackId?: string;
  materials?: readonly string[];
  designOwner?: "user" | "runtime-shim";
  metadata?: Readonly<Record<string, unknown>>;
};

export type HarnessSpec = {
  context?: ContextSpec;
  memory?: MemorySpec;
  storage?: StorageSpec;
  promptPack?: PromptPackSpec;
  tools?: readonly ToolSpec[];
  policy?: PolicySpec;
  loop?: LoopSpec;
  modules?: Readonly<Record<string, unknown>>;
  runtimeRequirements?: readonly string[];
  metadata?: Readonly<Record<string, unknown>>;
};

export type BehaviorSpec = Readonly<Record<string, unknown>>;
export type AgentHooks = Readonly<Record<string, unknown>>;

export abstract class PraxisAgent {
  abstract identity: AgentIdentity;
  abstract model: ModelSpec;
  abstract harness: HarnessSpec;
  behaviors?: BehaviorSpec;
  hooks?: AgentHooks;
}

export type AgentSourceKind = "class" | "instance";

export type AgentManifest = {
  kind: "praxis.agentManifest";
  schemaVersion: "praxis.agentManifest.v1";
  manifestId: string;
  manifestHash: string;
  compiledAt: string;
  source: {
    kind: AgentSourceKind;
    className?: string;
    constructorSideEffectsAllowed: false;
  };
  identity: {
    id: string;
    name?: string;
    version?: string;
    description?: string;
  };
  model: ModelSpec & {
    carrierId: string;
    endpointShape: string;
  };
  harness: Required<Pick<HarnessSpec, "context" | "memory" | "storage" | "promptPack" | "tools" | "policy" | "loop">> & {
    modules: Readonly<Record<string, unknown>>;
    runtimeRequirements: readonly string[];
    metadata: Readonly<Record<string, unknown>>;
  };
  behaviors?: BehaviorSpec;
  hooks?: AgentHooks;
  verification: {
    compiled: true;
    harnessDeclarative: true;
    runtimeExecutesManifestOnly: true;
  };
};

export type AgentCompileErrorCode =
  | "MISSING_AGENT"
  | "INVALID_AGENT_CLASS"
  | "MISSING_IDENTITY"
  | "MISSING_MODEL"
  | "MISSING_MODEL_NAME"
  | "MISSING_HARNESS";

export type AgentCompileResult =
  | {
      ok: true;
      manifest: AgentManifest;
      events: readonly string[];
    }
  | {
      ok: false;
      error: {
        code: AgentCompileErrorCode;
        message: string;
        boundary: "input" | "agent-object" | "manifest";
        publicSafe: true;
      };
      events: readonly string[];
    };

export type PraxisAgentClass<TAgent extends PraxisAgent = PraxisAgent> = new () => TAgent;
export type PraxisAgentInput<TAgent extends PraxisAgent = PraxisAgent> = TAgent | PraxisAgentClass<TAgent>;

export function model(modelName: string, input: Omit<ModelSpec, "provider" | "model"> & { provider?: ModelSpec["provider"] } = {}): ModelSpec {
  return {
    provider: input.provider ?? "openai",
    model: modelName,
    endpointShape: input.endpointShape ?? "responses",
    carrierId: input.carrierId,
    credentialRef: input.credentialRef,
    reasoning: input.reasoning,
    baseURL: input.baseURL,
    clientName: input.clientName,
    clientVersion: input.clientVersion,
    metadata: input.metadata,
  };
}

export function tool(toolId: string, input: Omit<ToolSpec, "toolId"> = {}): ToolSpec {
  return { toolId, ...input };
}

export function tools(items: readonly ToolSpec[]): readonly ToolSpec[] {
  return items;
}

export function policy(input: PolicySpec = {}): PolicySpec {
  return input;
}

export function loop(input: LoopSpec = { strategy: "tool-calling-v1" }): LoopSpec {
  return input;
}

export function harness(input: HarnessSpec): HarnessSpec {
  return input;
}

function isAgentClass(value: unknown): value is PraxisAgentClass {
  return typeof value === "function";
}

function hasText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanList(values: readonly string[] | undefined): readonly string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function manifestHash(manifest: Omit<AgentManifest, "manifestHash">): string {
  return createHash("sha256").update(stableJson(manifest)).digest("hex");
}

function normalizeIdentity(identity: AgentIdentity | undefined): AgentManifest["identity"] | undefined {
  if (typeof identity === "string") {
    const id = identity.trim();
    return id.length > 0 ? { id } : undefined;
  }

  if (identity === undefined || !hasText(identity.id)) {
    return undefined;
  }

  return {
    id: identity.id.trim(),
    name: identity.name?.trim() || undefined,
    version: identity.version?.trim() || undefined,
    description: identity.description?.trim() || undefined,
  };
}

function normalizeHarness(input: HarnessSpec): AgentManifest["harness"] {
  const loopSpec = input.loop ?? { strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 4 };
  return {
    context: input.context ?? {},
    memory: input.memory ?? { mode: "session" },
    storage: input.storage ?? { kind: "memory" },
    promptPack: {
      designOwner: "runtime-shim",
      ...(input.promptPack ?? {}),
    },
    tools: input.tools ?? [],
    policy: input.policy ?? {},
    loop: {
      strategy: loopSpec.strategy,
      maxModelTurns: loopSpec.maxModelTurns ?? 2,
      maxToolCalls: loopSpec.maxToolCalls ?? 4,
      metadata: loopSpec.metadata,
    },
    modules: input.modules ?? {},
    runtimeRequirements: cleanList(input.runtimeRequirements),
    metadata: input.metadata ?? {},
  };
}

function failure(
  code: AgentCompileErrorCode,
  message: string,
  boundary: "input" | "agent-object" | "manifest",
): AgentCompileResult {
  return {
    ok: false,
    error: { code, message, boundary, publicSafe: true },
    events: ["runtime.agentManifest.compile.rejected"],
  };
}

export function compileAgent<TAgent extends PraxisAgent>(
  input?: PraxisAgentInput<TAgent>,
  options: { compiledAt?: string; manifestId?: string } = {},
): AgentCompileResult {
  if (input === undefined) {
    return failure("MISSING_AGENT", "compileAgent requires a PraxisAgent class or instance", "input");
  }

  let agent: PraxisAgent;
  let source: AgentManifest["source"];
  try {
    if (isAgentClass(input)) {
      agent = new input();
      source = {
        kind: "class",
        className: input.name || undefined,
        constructorSideEffectsAllowed: false,
      };
    } else {
      agent = input;
      source = {
        kind: "instance",
        className: input.constructor.name || undefined,
        constructorSideEffectsAllowed: false,
      };
    }
  } catch {
    return failure("INVALID_AGENT_CLASS", "compileAgent could not instantiate the provided Agent class", "agent-object");
  }

  const identity = normalizeIdentity(agent.identity);
  if (identity === undefined) {
    return failure("MISSING_IDENTITY", "PraxisAgent requires a stable identity", "agent-object");
  }

  if (agent.model === undefined) {
    return failure("MISSING_MODEL", "PraxisAgent requires a model spec", "agent-object");
  }

  if (!hasText(agent.model.model)) {
    return failure("MISSING_MODEL_NAME", "PraxisAgent model spec requires a model name", "agent-object");
  }

  if (agent.harness === undefined) {
    return failure("MISSING_HARNESS", "PraxisAgent requires a declarative harness", "agent-object");
  }

  const compiledAt = options.compiledAt ?? new Date().toISOString();
  const modelSpec = {
    ...agent.model,
    provider: agent.model.provider,
    model: agent.model.model.trim(),
    endpointShape: agent.model.endpointShape ?? "responses",
    carrierId: agent.model.carrierId ?? `${identity.id}:carrier:${agent.model.provider}:${agent.model.model.trim()}`,
  };
  const manifestWithoutHash: Omit<AgentManifest, "manifestHash"> = {
    kind: "praxis.agentManifest",
    schemaVersion: "praxis.agentManifest.v1",
    manifestId: options.manifestId ?? `${identity.id}:manifest`,
    compiledAt,
    source,
    identity,
    model: modelSpec,
    harness: normalizeHarness(agent.harness),
    behaviors: agent.behaviors,
    hooks: agent.hooks,
    verification: {
      compiled: true,
      harnessDeclarative: true,
      runtimeExecutesManifestOnly: true,
    },
  };

  return {
    ok: true,
    manifest: {
      ...manifestWithoutHash,
      manifestHash: manifestHash(manifestWithoutHash),
    },
    events: ["runtime.agentManifest.compiled"],
  };
}
