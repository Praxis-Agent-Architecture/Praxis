import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { lowerPraxisToolsForProvider } from "../../src/modelAdapter/toolBridge/providerToolLowering.js";
import { createObservationMaterial } from "../../src/executionEngine/coreLogic/observationIntegrator.js";
import { assemblePromptContextMaterials } from "../../src/runtimeImplementation/runtime.execEngine/promptContextAssembly.js";
import { lowerPromptForModelAdapter } from "../../src/runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";
import type { PromptLoweringSegmentKind } from "../../src/runtimeImplementation/runtime.modelAdapter/promptLoweringRuntime.js";
import type { AgentManifest } from "../../src/runtimeImplementation/runtimeAgentManifest.js";

type CacheSegmentPolicy = "cacheable-prefix" | "dynamic-no-cache";

export type RuntimePromptPackCacheSmokeResult = {
  status: "ok" | "failed";
  promptPack: {
    id: string;
    materialCount: number;
    segmentKinds: readonly string[];
  };
  cachePlan: {
    stablePrefixHash: string;
    cacheablePrefixSegmentKinds: readonly PromptLoweringSegmentKind[];
    dynamicSegmentKinds: readonly PromptLoweringSegmentKind[];
    segments: readonly {
      segmentKind: PromptLoweringSegmentKind;
      materialRefs: readonly string[];
      estimatedTokens: number;
      cachePolicy: CacheSegmentPolicy;
    }[];
    providerCacheHintPlan: {
      providerFamily: string;
      stableToolDeclarationHash: string;
      cacheablePrefixKinds: readonly string[];
      cacheRiskWarnings: readonly string[];
    };
  };
  providerLowering: {
    route: string;
    providerVisibleSegmentKinds: readonly PromptLoweringSegmentKind[];
    hiddenInternalSegmentKinds: readonly PromptLoweringSegmentKind[];
    materialRefs: readonly string[];
    cacheRiskWarnings: readonly string[];
    invariantChecks: {
      stablePrefixExcludesUserTurn: boolean;
      stablePrefixExcludesObservations: boolean;
      providerUsesCacheHintPlan: boolean;
      dynamicInputHasCurrentTask: boolean;
    };
  };
};

const CACHEABLE_PREFIX_SEGMENTS = new Set<PromptLoweringSegmentKind>([
  "stableSystemCore",
  "declaredRuntimeContext",
  "toolDeclarations",
  "projectContext",
  "sessionSummary",
  "memoryContext",
]);

const DYNAMIC_SEGMENTS = new Set<PromptLoweringSegmentKind>([
  "retrievedContext",
  "observations",
  "userTurn",
]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : Math.max(1, Math.ceil(trimmed.length / 4));
}

function manifest(): AgentManifest {
  return {
    manifestId: "manifest.promptpack.cache-smoke",
    identity: { id: "agent.promptpack.cache-smoke" },
    model: {
      model: "gpt-5.5",
      provider: "openai",
      endpointShape: "responses",
      carrierId: "carrier.promptpack.cache-smoke",
    },
    promptPack: {
      promptPackId: "promptpack.cache-smoke",
      base: {
        kind: "markdown",
        ref: "promptpack.cache-smoke:base",
        text: "You are a Praxis cache smoke agent. Keep stable instructions cacheable.",
      },
      inherits: [],
      patches: [
        {
          patchId: "promptpack.cache-smoke:runtime-policy",
          operation: "append",
          targetRef: "runtime-policy",
          material: {
            kind: "markdown",
            ref: "promptpack.cache-smoke:runtime-policy",
            text: "Runtime policy: tool calls must stay governed by Praxis.",
          },
        },
      ],
      stateMachineMutations: [],
      materials: ["promptPackage:cache-smoke/project-guidance"],
    },
    harness: {
      tools: [
        {
          toolId: "file.read",
          family: "coreBase",
          group: "file",
          description: "Read a workspace file.",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string" } },
            required: ["path"],
            additionalProperties: false,
          },
          metadata: { toolProviderKind: "baseTool", riskLevel: "safe" },
        },
      ],
      loop: { strategy: "tool-calling-v1", maxModelTurns: 2, maxToolCalls: 2 },
      metadata: { toolProfile: "standard" },
    },
  } as unknown as AgentManifest;
}

function segmentKindOf(value: unknown): PromptLoweringSegmentKind {
  return typeof value === "string" && value.length > 0
    ? value as PromptLoweringSegmentKind
    : "observations";
}

export function runRuntimePromptPackCacheSmoke(): RuntimePromptPackCacheSmokeResult {
  const testManifest = manifest();
  const providerTools = lowerPraxisToolsForProvider({
    providerFamily: "openaiResponses",
    manifest: testManifest,
    includeRuntimeDecisionTools: false,
  });
  const assembled = assemblePromptContextMaterials({
    manifest: testManifest,
    task: "Use the current request to inspect prompt cache separation.",
    turnIndex: 1,
    workspaceRoot: "/workspace/praxis-cache-smoke",
    allowedRoots: ["/workspace/praxis-cache-smoke"],
    toolMappings: providerTools.mappings,
    observations: [
      createObservationMaterial({
        observationId: "observation.cache-smoke.1",
        source: "baseTool",
        status: "completed",
        title: "Tool observation",
        summary: "file.read returned current package metadata.",
        payload: { packageName: "@praxis-ai/praxis", version: "0.1.4" },
        metadata: {
          toolCallId: "call-cache-smoke-1",
          toolId: "file.read",
        },
      }),
    ],
    events: ["runtime.session.created", "runtime.tool.completed"],
    sessionSummary: {
      summaryId: "summary.cache-smoke",
      text: "Prior turns established that stable policy and tool declarations should stay cacheable.",
      compactedUntilTurnId: "turn.0",
    },
    conversationWindow: [
      { messageId: "m1", role: "assistant", text: "Earlier dynamic answer." },
    ],
    budget: { contextWindowTokens: 8192, responseReserveTokens: 512, safetyMarginTokens: 256 },
  });
  const lowering = lowerPromptForModelAdapter({
    runtimeId: "runtime.promptpack.cache-smoke",
    caller: { kind: "application", id: "application.promptpack.cache-smoke", sessionId: "session.cache-smoke" },
    promptPack: {
      id: testManifest.promptPack.promptPackId,
      materials: assembled.materials.map((material) => ({
        kind: material.kind,
        ref: material.id,
        text: material.text,
        sourceCategory: material.sourceCategory,
        promptSegmentKind: segmentKindOf(material.promptSegmentKind),
        priority: material.priority,
        metadata: material.metadata,
      })),
      metadata: { source: "runtime.promptContextAssembly" },
    },
    target: { capabilityId: "capability:text", carrierId: "carrier.promptpack.cache-smoke" },
    providerToolBundle: providerTools,
    providerCacheHintPlan: providerTools.cacheHintPlan,
  });

  if (!lowering.ok) {
    throw new Error(`PromptPack cache smoke lowering failed: ${lowering.error.code}`);
  }

  const grouped = new Map<PromptLoweringSegmentKind, { refs: string[]; tokens: number }>();
  for (const material of lowering.loweredPrompt.materials) {
    const segmentKind = material.promptSegmentKind ?? "observations";
    const existing = grouped.get(segmentKind) ?? { refs: [], tokens: 0 };
    existing.refs.push(material.materialId);
    existing.tokens += estimateTokens(material.text ?? material.ref ?? material.materialId);
    grouped.set(segmentKind, existing);
  }
  const segmentKinds = [...grouped.keys()];
  const cacheablePrefixSegmentKinds = segmentKinds.filter((kind) => CACHEABLE_PREFIX_SEGMENTS.has(kind));
  const dynamicSegmentKinds = segmentKinds.filter((kind) => DYNAMIC_SEGMENTS.has(kind));
  const stablePrefixMaterials = lowering.loweredPrompt.materials.filter((material) =>
    material.promptSegmentKind !== undefined && CACHEABLE_PREFIX_SEGMENTS.has(material.promptSegmentKind)
  );
  const stablePrefixHash = hashStable({
    providerToolHash: providerTools.cacheHintPlan.stableToolDeclarationHash,
    materials: stablePrefixMaterials.map((material) => ({
      segmentKind: material.promptSegmentKind,
      materialId: material.materialId,
      kind: material.kind,
      text: material.text,
      ref: material.ref,
    })),
  });
  const invariantChecks = {
    stablePrefixExcludesUserTurn: !cacheablePrefixSegmentKinds.includes("userTurn"),
    stablePrefixExcludesObservations: !cacheablePrefixSegmentKinds.includes("observations"),
    providerUsesCacheHintPlan:
      lowering.loweredPrompt.providerCacheHintPlan?.stableToolDeclarationHash
      === providerTools.cacheHintPlan.stableToolDeclarationHash,
    dynamicInputHasCurrentTask: lowering.loweredPrompt.materials.some((material) =>
      material.promptSegmentKind === "userTurn" && (material.text ?? "").includes("current request")
    ),
  };

  const status = Object.values(invariantChecks).every(Boolean) ? "ok" : "failed";
  return {
    status,
    promptPack: {
      id: lowering.loweredPrompt.promptPackId,
      materialCount: lowering.loweredPrompt.materials.length,
      segmentKinds,
    },
    cachePlan: {
      stablePrefixHash,
      cacheablePrefixSegmentKinds,
      dynamicSegmentKinds,
      segments: segmentKinds.map((segmentKind) => {
        const entry = grouped.get(segmentKind)!;
        return {
          segmentKind,
          materialRefs: entry.refs,
          estimatedTokens: entry.tokens,
          cachePolicy: CACHEABLE_PREFIX_SEGMENTS.has(segmentKind) ? "cacheable-prefix" : "dynamic-no-cache",
        };
      }),
      providerCacheHintPlan: {
        providerFamily: providerTools.cacheHintPlan.providerFamily,
        stableToolDeclarationHash: providerTools.cacheHintPlan.stableToolDeclarationHash,
        cacheablePrefixKinds: providerTools.cacheHintPlan.cacheablePrefixKinds,
        cacheRiskWarnings: providerTools.cacheHintPlan.cacheRiskWarnings,
      },
    },
    providerLowering: {
      route: lowering.loweredPrompt.route,
      providerVisibleSegmentKinds: lowering.loweredPrompt.providerVisibleSegmentKinds,
      hiddenInternalSegmentKinds: lowering.loweredPrompt.hiddenInternalSegmentKinds,
      materialRefs: lowering.loweredPrompt.materialRefs,
      cacheRiskWarnings: [
        ...providerTools.cacheHintPlan.cacheRiskWarnings,
        ...lowering.loweredPrompt.policy.degradationRecords
          .filter((record) => record.kind === "cache")
          .map((record) => record.reason ?? "prompt lowering cache degradation"),
      ],
      invariantChecks,
    },
  };
}

async function main(): Promise<void> {
  const result = runRuntimePromptPackCacheSmoke();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ok") process.exitCode = 1;
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
