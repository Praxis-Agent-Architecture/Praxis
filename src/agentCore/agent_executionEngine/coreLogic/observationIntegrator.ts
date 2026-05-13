/*
 * 文件定位：Agent 执行引擎 / 执行核心逻辑。
 * 核心目的：把工具和临时过程执行结果整理成 PromptPack 可消费的 observation material。
 * 边界：只做观测摘要和引用，不重放工具语义，不写 TAP/CMP/MP/multiagent 策略。
 * 对接：连接 BaseTool/Procedure 执行结果、PromptPack assembly 和下一轮 mainLoop。
 * 实现提示：保持 provider-neutral material，不在这里生成 provider payload 或最终输出。
 */

import type { PromptPackMaterialDraft } from "../promptPack/promptDefiner.js";

export type ObservationTrustLevel =
  | "runtimeFact"
  | "toolOutput"
  | "modelInterpretation"
  | "userProvided"
  | "externalSource"
  | "cachedSummary";

export type ToolResultSizePolicy = {
  maxInlineBytes: number;
  overflowMode: "artifactRef";
};

export type ObservationArtifactRef = {
  artifactId: string;
  uri: string;
  byteLength: number;
  reason: "toolResultTooLarge" | "manualArtifact";
  metadata: Readonly<Record<string, unknown>>;
};

export type LargeObservationSelectionFlow = {
  kind: "largeObservationSelection";
  artifactRef: ObservationArtifactRef;
  modelInstruction: string;
  selectionBudgetBytes: number;
  publicSafe: true;
};

export type ObservationSummaryDelegationPolicy = {
  mode: "cmp" | "summaryAgent" | "disabled";
  summaryAgentRef?: string;
  allowCurrentAgentSelfSummary: boolean;
  compressionRatio?: number;
  metadata: Readonly<Record<string, unknown>>;
};

export type ObservationCompressionPolicy = {
  enabled: boolean;
  compressionRatio: number;
  primitive: "compressObservation";
  owner: "cmp" | "summaryAgent" | "runtimeFallback";
  metadata: Readonly<Record<string, unknown>>;
};

export type SummaryAgentRef = {
  agentRef: string;
  role: "observationSummary";
  compressionRatio: number;
  publicSafe: true;
};

export type FallbackMemoryRef = {
  memoryId: string;
  kind: "sessionLocalMarkdownIndex";
  storageHint: ".rax_workspace" | "memory";
  takeoverReadyForMp: boolean;
  publicSafe: true;
};

export type ObservationMaterial = RuntimeObservationMaterial;

export type RuntimeObservationInput = {
  observationId: string;
  source: "baseTool" | "ephemeralProcedure" | "runtime" | "model";
  status: "completed" | "failed" | "waitingApproval" | "interrupted";
  title: string;
  summary: string;
  refs?: readonly string[];
  payload?: unknown;
  trustLevel?: ObservationTrustLevel;
  sizePolicy?: Partial<ToolResultSizePolicy>;
  artifactUri?: string;
  summaryDelegation?: Partial<ObservationSummaryDelegationPolicy>;
  compression?: Partial<ObservationCompressionPolicy>;
  metadata?: Readonly<Record<string, string | number | boolean | object>>;
};

export type RuntimeObservationMaterial = {
  observationId: string;
  material: PromptPackMaterialDraft;
  refs: readonly string[];
  payload: unknown;
  trustLevel: ObservationTrustLevel;
  summaryDelegation: ObservationSummaryDelegationPolicy;
  compression: ObservationCompressionPolicy;
  artifactRef?: ObservationArtifactRef;
  selectionFlow?: LargeObservationSelectionFlow;
};

export const DEFAULT_TOOL_RESULT_SIZE_POLICY: ToolResultSizePolicy = {
  maxInlineBytes: 64 * 1024,
  overflowMode: "artifactRef",
};

export const DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY: ObservationSummaryDelegationPolicy = {
  mode: "summaryAgent",
  summaryAgentRef: "summaryAgent.default",
  allowCurrentAgentSelfSummary: false,
  compressionRatio: 0.05,
  metadata: {},
};

export const DEFAULT_OBSERVATION_COMPRESSION_POLICY: ObservationCompressionPolicy = {
  enabled: true,
  compressionRatio: 0.05,
  primitive: "compressObservation",
  owner: "summaryAgent",
  metadata: {},
};

export const DEFAULT_SUMMARY_AGENT_REF: SummaryAgentRef = {
  agentRef: "summaryAgent.default",
  role: "observationSummary",
  compressionRatio: 0.05,
  publicSafe: true,
};

export function createFallbackMemoryRef(sessionId: string, storageHint: ".rax_workspace" | "memory" = ".rax_workspace"): FallbackMemoryRef {
  return {
    memoryId: `${sessionId.trim() || "session"}:memory:fallback-md-index`,
    kind: "sessionLocalMarkdownIndex",
    storageHint,
    takeoverReadyForMp: true,
    publicSafe: true,
  };
}

function safeStringify(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable observation payload]";
  }
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function defaultTrustLevel(input: RuntimeObservationInput): ObservationTrustLevel {
  if (input.trustLevel !== undefined) return input.trustLevel;
  if (input.source === "baseTool" || input.source === "ephemeralProcedure") return "toolOutput";
  if (input.source === "model") return "modelInterpretation";
  return "runtimeFact";
}

function artifactRefFor(input: RuntimeObservationInput, payloadText: string): ObservationArtifactRef {
  const artifactId = `${input.observationId}:artifact:payload`;
  return {
    artifactId,
    uri: input.artifactUri ?? `artifact://${artifactId}`,
    byteLength: byteLength(payloadText),
    reason: "toolResultTooLarge",
    metadata: {
      observationId: input.observationId,
      source: input.source,
    },
  };
}

function resolveSummaryDelegation(input: RuntimeObservationInput): ObservationSummaryDelegationPolicy {
  const override = input.summaryDelegation ?? {};
  return {
    ...DEFAULT_OBSERVATION_SUMMARY_DELEGATION_POLICY,
    ...override,
    metadata: override.metadata ?? {},
  };
}

function resolveCompression(input: RuntimeObservationInput, summaryDelegation: ObservationSummaryDelegationPolicy): ObservationCompressionPolicy {
  const override = input.compression ?? {};
  return {
    ...DEFAULT_OBSERVATION_COMPRESSION_POLICY,
    owner: summaryDelegation.mode === "cmp" ? "cmp" : summaryDelegation.mode === "summaryAgent" ? "summaryAgent" : "runtimeFallback",
    compressionRatio: summaryDelegation.compressionRatio ?? DEFAULT_OBSERVATION_COMPRESSION_POLICY.compressionRatio,
    ...override,
    metadata: override.metadata ?? {},
  };
}

export function createObservationMaterial(input: RuntimeObservationInput): RuntimeObservationMaterial {
  const payloadText = safeStringify(input.payload);
  const sizePolicy = {
    ...DEFAULT_TOOL_RESULT_SIZE_POLICY,
    ...(input.sizePolicy ?? {}),
  };
  const trustLevel = defaultTrustLevel(input);
  const payloadBytes = byteLength(payloadText);
  const shouldArtifact = payloadBytes > sizePolicy.maxInlineBytes;
  const artifactRef = shouldArtifact ? artifactRefFor(input, payloadText) : undefined;
  const summaryDelegation = resolveSummaryDelegation(input);
  const compression = resolveCompression(input, summaryDelegation);
  const selectionFlow = artifactRef === undefined ? undefined : {
    kind: "largeObservationSelection" as const,
    artifactRef,
    modelInstruction: "The full observation payload is stored as an artifact. Select only the relevant byte range or excerpt before using it as prompt context.",
    selectionBudgetBytes: Math.min(sizePolicy.maxInlineBytes, 1024 * 1024),
    publicSafe: true as const,
  };
  const text = [
    `${input.title}: ${input.summary}`,
    artifactRef === undefined && payloadText.length > 0 ? `payload: ${payloadText}` : "",
    artifactRef === undefined ? "" : `payloadArtifact: ${artifactRef.uri}`,
    artifactRef === undefined ? "" : `payloadBytes: ${artifactRef.byteLength}`,
  ].filter(Boolean).join("\n");

  return {
    observationId: input.observationId,
    refs: input.refs ?? [],
    payload: input.payload,
    trustLevel,
    summaryDelegation,
    compression,
    ...(artifactRef === undefined ? {} : { artifactRef }),
    ...(selectionFlow === undefined ? {} : { selectionFlow }),
    material: {
      id: input.observationId,
      kind: input.source === "baseTool" || input.source === "ephemeralProcedure" ? "tool-summary" : "runtime",
      text,
      source: `runtime.observation.${input.source}`,
      priority: input.status === "failed" ? 80 : 40,
      trusted: true,
      scope: "runtime.observation",
      metadata: {
        observationId: input.observationId,
        observationSource: input.source,
        observationStatus: input.status,
        observationTrustLevel: trustLevel,
        payloadBytes,
        artifactUri: artifactRef?.uri ?? "",
        largeObservationSelection: artifactRef === undefined ? false : true,
        summaryDelegationMode: summaryDelegation.mode,
        summaryAgentRef: summaryDelegation.summaryAgentRef ?? "",
        allowCurrentAgentSelfSummary: summaryDelegation.allowCurrentAgentSelfSummary,
        compressionEnabled: compression.enabled,
        compressionRatio: compression.compressionRatio,
        compressionPrimitive: compression.primitive,
        compressionOwner: compression.owner,
        ...(input.metadata ?? {}),
      },
    },
  };
}
