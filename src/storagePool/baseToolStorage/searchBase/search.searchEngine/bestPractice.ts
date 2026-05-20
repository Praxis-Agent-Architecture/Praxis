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
import { anthropicSearchEnginePractice } from "./anthropic.js";
import { deepmindSearchEnginePractice } from "./deepmind.js";
import { openaiSearchEnginePractice } from "./openai.js";
import {
  planSearchEngineQuery as planSearchEngineQueryCore,
  type SearchEngineContext,
  type SearchEngineExecutor,
  type SearchEngineOutput,
  type SearchEngineRequest,
  type SearchEngineResult,
} from "./core.js";
import {
  searchEngineDependencyDeclarations,
  searchEngineRuntimePort,
  type SearchEngineDependencies,
  type SearchEnginePracticeProviderName,
  type SearchEngineProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type SearchEngineBestPracticeRequest = SearchEngineRequest & {
  executorPort?: BaseToolExecutorPort;
  preferredProvider?: SearchEnginePracticeProviderName;
};

export type SearchEngineHandlerInput = Omit<SearchEngineBestPracticeRequest, "executorPort">;
export type SearchEnginePracticeSelection = { providerName: SearchEnginePracticeProviderName; practice: SearchEngineProviderPractice; provider?: SearchEngineExecutor };

export const searchEngineProviderPractices = [anthropicSearchEnginePractice, openaiSearchEnginePractice, deepmindSearchEnginePractice] as const;

export const searchEngineBestPracticeDescriptor = {
  toolId: "search.searchEngine",
  bestPractice: "storage-owned-generic-search-engine-with-runtime-network-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: searchEngineDependencyDeclarations,
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
  return path.join(repoRoot, "src", "agentCore", "agent_executionEngine", "basic_toolLayer", "baseTools", "searchBase", "search.searchEngine.ts").split(path.sep).join("/");
}

function storageDocPath(): string {
  return path.join(storageRoot, "search.searchEngine.md").split(path.sep).join("/");
}

function orderedPractices(preferredProvider: SearchEnginePracticeProviderName | undefined): readonly SearchEngineProviderPractice[] {
  if (preferredProvider === undefined || preferredProvider === "praxis-native") return searchEngineProviderPractices;
  return [
    ...searchEngineProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...searchEngineProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectSearchEnginePractice(
  dependencies: SearchEngineDependencies & { preferredProvider?: SearchEnginePracticeProviderName } = {},
): SearchEnginePracticeSelection {
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
      notes: ["No injected runtime.network.search provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: SearchEnginePracticeSelection): Readonly<Record<string, unknown>> {
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

function adaptResult(result: SearchEngineResult): BaseToolInvokeResult<SearchEngineOutput> {
  if (!result.ok) {
    return { ok: false, toolId: result.toolId, error: { code: result.error.code, message: result.error.message, publicSafe: true }, events: result.events };
  }
  return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
}

function injectRuntimeMetadata(
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId" | "metadata">,
  context: SearchEngineContext | undefined,
  selection: SearchEnginePracticeSelection,
): SearchEngineContext {
  return {
    ...(context ?? {}),
    runtimeId: context?.runtimeId ?? request.runtimeId,
    sessionId: context?.sessionId ?? request.sessionId,
    invocationId: context?.invocationId ?? request.toolCallId,
    auditMetadata: { ...practiceAuditMetadata(selection), ...(context?.auditMetadata ?? {}), ...(request.metadata ?? {}), runtimeId: request.runtimeId, sessionId: request.sessionId, toolCallId: request.toolCallId },
  };
}

export async function executeSearchEngineQuery(request: SearchEngineBestPracticeRequest = {}): ReturnType<typeof planSearchEngineQueryCore> {
  if (!isRecord(request)) return planSearchEngineQueryCore(request as SearchEngineRequest);
  const selection = selectSearchEnginePractice({ executor: request.executorPort, provider: request.executor ?? request.provider, preferredProvider: request.preferredProvider });
  return planSearchEngineQueryCore({
    ...request,
    executor: selection.provider,
    context: { ...(request.context ?? {}), auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } },
  });
}

export const planSearchEngineQuery = executeSearchEngineQuery;

export const searchEngineBaseToolDefinition: BaseToolDefinition<SearchEngineHandlerInput, SearchEngineOutput> = {
  toolId: "search.searchEngine",
  source: "builtin",
  family: "search",
  group: "(flat)",
  title: "Search Search Engine",
  description: "Query generic or custom search engines through a governed runtime network provider.",
  toolSkill: { docPath: storageDocPath(), summary: "Use search.searchEngine for portable search-engine result collection.", riskLevel: "normal" },
  inputSchema: jsonSchema("search.searchEngine.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["query"],
        properties: {
          query: { type: "string" },
          provider: { type: "string", enum: ["generic", "browser", "custom"] },
          maxResults: { type: "integer", minimum: 1, maximum: 50 },
          recencyDays: { type: "integer", minimum: 1 },
          safeSearch: { type: "boolean" },
          locale: { type: "string" },
        },
      },
      context: { type: "object", additionalProperties: true },
    },
  }),
  outputSchema: jsonSchema("search.searchEngine.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "requestPreview", "dispatch", "dryRun", "providerCalled", "runtimeEntry", "executionBlocked", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.search.searchEngine" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-search"] },
      providerCalled: { type: "boolean" },
      runtimeEntry: { type: "object" },
      resultEnvelope: { type: "object" },
    },
  }),
  riskLevel: "normal",
  permissionHints: ["network:search"],
  dependencies: searchEngineDependencyDeclarations,
  storagePolicy: { storesMaterial: true, storesResult: true, storesAudit: true, reusable: true },
  sourcePath: entrySourcePath(),
  metadata: { storagePracticePath: path.join(storageRoot, "bestPractice.ts").split(path.sep).join("/"), searchRuntimePort: searchEngineRuntimePort },
};

export const searchEngineHandler: BaseToolHandler<SearchEngineHandlerInput, SearchEngineOutput> = {
  definition: searchEngineBaseToolDefinition,
  async invoke(request) {
    if (!isRecord(request.input)) return adaptResult(await planSearchEngineQueryCore(request.input as SearchEngineRequest));
    const selection = selectSearchEnginePractice({ ...request.input, executor: request.executor, provider: request.input.executor ?? request.input.provider });
    const context = injectRuntimeMetadata(request, request.input.context, selection);
    return adaptResult(await planSearchEngineQueryCore({ ...request.input, executor: selection.provider, context }));
  },
};
