import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BaseToolExecutorPort } from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  BaseToolDefinition,
  BaseToolHandler,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
  BaseToolSchemaLike,
} from "../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSearchGroundPractice } from "./anthropic.js";
import { deepmindSearchGroundPractice } from "./deepmind.js";
import { openaiSearchGroundPractice } from "./openai.js";
import {
  planSearchGround as planSearchGroundCore,
  type SearchGroundContext,
  type SearchGroundExecutor,
  type SearchGroundOutput,
  type SearchGroundRequest,
  type SearchGroundResult,
} from "./core.js";
import {
  searchGroundDependencyDeclarations,
  type SearchGroundDependencies,
  type SearchGroundPracticeProviderName,
  type SearchGroundProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type SearchGroundBestPracticeRequest = SearchGroundRequest & {
  executorPort?: BaseToolExecutorPort;
  preferredProvider?: SearchGroundPracticeProviderName;
};

export type SearchGroundHandlerInput = Omit<SearchGroundBestPracticeRequest, "executorPort">;
export type SearchGroundPracticeSelection = { providerName: SearchGroundPracticeProviderName; practice: SearchGroundProviderPractice; provider?: SearchGroundExecutor };

export const searchGroundProviderPractices = [openaiSearchGroundPractice, anthropicSearchGroundPractice, deepmindSearchGroundPractice] as const;

export const searchGroundBestPracticeDescriptor = {
  toolId: "search.ground",
  bestPractice: "storage-owned-evidence-grounding-with-runtime-provider-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["openai", "anthropic", "deepmind"],
  dependencies: searchGroundDependencyDeclarations,
} as const;

const storageRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(storageRoot, "../../../../..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonSchema(name: string, schema: unknown): BaseToolSchemaLike {
  return { kind: "json-schema", name, schema };
}

function entrySourcePath(): string {
  return path.join(repoRoot, "src", "agentCore", "agent_executionEngine", "basic_toolLayer", "baseTools", "searchBase", "search.ground.ts").split(path.sep).join("/");
}

function storageDocPath(): string {
  return path.join(storageRoot, "search.ground.md").split(path.sep).join("/");
}

function orderedPractices(preferredProvider: SearchGroundPracticeProviderName | undefined): readonly SearchGroundProviderPractice[] {
  if (preferredProvider === undefined || preferredProvider === "praxis-native") return searchGroundProviderPractices;
  return [
    ...searchGroundProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...searchGroundProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectSearchGroundPractice(
  dependencies: SearchGroundDependencies & { preferredProvider?: SearchGroundPracticeProviderName } = {},
): SearchGroundPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "read-only",
      notes: ["No injected runtime.network.ground provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: SearchGroundPracticeSelection): Readonly<Record<string, unknown>> {
  return {
    selectedPractice: selection.providerName,
    selectedPracticeSource: selection.practice.source.label,
    selectedPracticeSourceKind: selection.practice.source.kind,
    selectedPracticeSourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  };
}

function adaptResult(result: SearchGroundResult): BaseToolInvokeResult<SearchGroundOutput> {
  if (!result.ok) {
    return { ok: false, toolId: result.toolId, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
  }
  return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
}

function injectRuntimeMetadata(
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId" | "metadata">,
  context: SearchGroundContext | undefined,
  selection: SearchGroundPracticeSelection,
): SearchGroundContext {
  return {
    ...(context ?? {}),
    runtimeId: context?.runtimeId ?? request.runtimeId,
    sessionId: context?.sessionId ?? request.sessionId,
    invocationId: context?.invocationId ?? request.toolCallId,
    auditMetadata: { ...practiceAuditMetadata(selection), ...(context?.auditMetadata ?? {}), ...(request.metadata ?? {}), runtimeId: request.runtimeId, sessionId: request.sessionId, toolCallId: request.toolCallId },
  };
}

export async function executeSearchGround(request: SearchGroundBestPracticeRequest = {}): ReturnType<typeof planSearchGroundCore> {
  if (!isRecord(request)) return planSearchGroundCore(request as SearchGroundRequest);
  const selection = selectSearchGroundPractice({ executor: request.executorPort, provider: request.executor ?? request.provider, preferredProvider: request.preferredProvider });
  return planSearchGroundCore({
    ...request,
    executor: selection.provider,
    context: { ...(request.context ?? {}), auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } },
  });
}

export const planSearchGround = executeSearchGround;

export const searchGroundBaseToolDefinition: BaseToolDefinition<SearchGroundHandlerInput, SearchGroundOutput> = {
  toolId: "search.ground",
  source: "builtin",
  family: "search",
  group: "(flat)",
  title: "Search Ground",
  description: "Ground a factual claim against evidence and citations through a governed runtime provider.",
  toolSkill: { docPath: storageDocPath(), summary: "Use search.ground for evidence-backed grounding and citation normalization.", riskLevel: "normal" },
  inputSchema: jsonSchema("search.ground.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["claim", "evidence"],
        properties: {
          claim: { type: "string" },
          evidence: { type: "array", items: { type: "object" } },
          mode: { type: "string", enum: ["strict", "balanced", "exploratory"] },
          minimumEvidenceCount: { type: "integer", minimum: 1 },
          provider: { type: "string", enum: ["openai", "anthropic", "deepmind", "generic"] },
          model: { type: "string" },
          citations: { type: "string", enum: ["required", "preferred", "off"] },
        },
      },
      context: { type: "object", additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("search.ground.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "requestPreview", "dispatch", "dryRun", "executionBlocked", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.search.ground" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-ground"] },
      resultEnvelope: { type: "object" },
    },
  }),
  riskLevel: "normal",
  permissionHints: ["search:read", "grounding:audit"],
  dependencies: searchGroundDependencyDeclarations,
  storagePolicy: { storesMaterial: true, storesResult: true, storesAudit: true, reusable: true },
  sourcePath: entrySourcePath(),
  metadata: { storagePracticePath: path.join(storageRoot, "bestPractice.ts").split(path.sep).join("/") },
};

export const searchGroundHandler: BaseToolHandler<SearchGroundHandlerInput, SearchGroundOutput> = {
  definition: searchGroundBaseToolDefinition,
  async invoke(request) {
    if (!isRecord(request.input)) return adaptResult(await planSearchGroundCore(request.input as SearchGroundRequest));
    const selection = selectSearchGroundPractice({ ...request.input, executor: request.executor, provider: request.input.executor ?? request.input.provider });
    const context = injectRuntimeMetadata(request, request.input.context, selection);
    return adaptResult(await planSearchGroundCore({ ...request.input, executor: selection.provider, context }));
  },
};
