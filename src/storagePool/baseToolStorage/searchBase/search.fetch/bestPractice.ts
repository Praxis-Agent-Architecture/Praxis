import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BaseToolExecutorPort } from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  BaseToolDefinition,
  BaseToolHandler,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
  BaseToolSchemaLike,
} from "../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicSearchFetchPractice } from "./anthropic.js";
import { deepmindSearchFetchPractice } from "./deepmind.js";
import { openaiSearchFetchPractice } from "./openai.js";
import {
  planSearchFetch as planSearchFetchCore,
  type SearchFetchContext,
  type SearchFetchExecutor,
  type SearchFetchOutput,
  type SearchFetchRequest,
  type SearchFetchResult,
} from "./core.js";
import {
  searchFetchDependencyDeclarations,
  type SearchFetchDependencies,
  type SearchFetchPracticeProviderName,
  type SearchFetchProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type SearchFetchBestPracticeRequest = SearchFetchRequest & {
  executorPort?: BaseToolExecutorPort;
  preferredProvider?: SearchFetchPracticeProviderName;
};

export type SearchFetchHandlerInput = Omit<SearchFetchBestPracticeRequest, "executorPort">;

export type SearchFetchPracticeSelection = {
  providerName: SearchFetchPracticeProviderName;
  practice: SearchFetchProviderPractice;
  provider?: SearchFetchExecutor;
};

export const searchFetchProviderPractices = [
  anthropicSearchFetchPractice,
  deepmindSearchFetchPractice,
  openaiSearchFetchPractice,
] as const;

export const searchFetchBestPracticeDescriptor = {
  toolId: "search.fetch",
  bestPractice: "storage-owned-runtime-fetch-with-provider-practice-evidence",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "deepmind", "openai"],
  dependencies: searchFetchDependencyDeclarations,
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
  return path
    .join(repoRoot, "src", "agentCore", "agent_executionEngine", "basic_toolLayer", "baseTools", "searchBase", "search.fetch.ts")
    .split(path.sep)
    .join("/");
}

function storageDocPath(): string {
  return path.join(storageRoot, "search.fetch.md").split(path.sep).join("/");
}

function orderedPractices(preferredProvider: SearchFetchPracticeProviderName | undefined): readonly SearchFetchProviderPractice[] {
  if (preferredProvider === undefined || preferredProvider === "praxis-native") return searchFetchProviderPractices;
  return [
    ...searchFetchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...searchFetchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectSearchFetchPractice(
  dependencies: SearchFetchDependencies & { preferredProvider?: SearchFetchPracticeProviderName } = {},
): SearchFetchPracticeSelection {
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
      notes: ["No injected runtime.network.fetch provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: SearchFetchPracticeSelection): Readonly<Record<string, unknown>> {
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

function adaptResult(result: SearchFetchResult): BaseToolInvokeResult<SearchFetchOutput> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: result.toolId,
      error: { code: result.error.code, message: result.error.message, publicSafe: true },
      events: result.events,
    };
  }
  return { ok: true, toolId: result.toolId, output: result.output, events: result.events, metadata: { audit: result.audit } };
}

function injectRuntimeMetadata(
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId" | "metadata">,
  context: SearchFetchContext | undefined,
  selection: SearchFetchPracticeSelection,
): SearchFetchContext {
  return {
    ...(context ?? {}),
    runtimeId: context?.runtimeId ?? request.runtimeId,
    sessionId: context?.sessionId ?? request.sessionId,
    invocationId: context?.invocationId ?? request.toolCallId,
    auditMetadata: {
      ...practiceAuditMetadata(selection),
      ...(context?.auditMetadata ?? {}),
      ...(request.metadata ?? {}),
      runtimeId: request.runtimeId,
      sessionId: request.sessionId,
      toolCallId: request.toolCallId,
    },
  };
}

export async function executeSearchFetch(request: SearchFetchBestPracticeRequest = {}): ReturnType<typeof planSearchFetchCore> {
  if (!isRecord(request)) {
    return planSearchFetchCore(request as SearchFetchRequest);
  }
  const selection = selectSearchFetchPractice({
    executor: request.executorPort,
    provider: request.executor ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return planSearchFetchCore({
    ...request,
    executor: selection.provider,
    context: {
      ...(request.context ?? {}),
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...practiceAuditMetadata(selection),
      },
    },
  });
}

export const planSearchFetch = executeSearchFetch;

export const searchFetchBaseToolDefinition: BaseToolDefinition<SearchFetchHandlerInput, SearchFetchOutput> = {
  toolId: "search.fetch",
  source: "builtin",
  family: "search",
  group: "(flat)",
  title: "Search Fetch",
  description: "Fetch targeted web content through a governed runtime network fetch provider.",
  toolSkill: { docPath: storageDocPath(), summary: "Use search.fetch for targeted URL/page retrieval.", riskLevel: "normal" },
  inputSchema: jsonSchema("search.fetch.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["url"],
        properties: {
          url: { type: "string" },
          method: { type: "string", enum: ["GET", "HEAD"] },
          expectedContentType: { type: "string" },
          maxBytes: { type: "integer", minimum: 1, maximum: 10485760 },
          timeoutMs: { type: "integer", minimum: 1, maximum: 120000 },
        },
      },
      context: { type: "object", additionalProperties: true },
      url: { type: "string" },
    },
  }),
  outputSchema: jsonSchema("search.fetch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "requestPreview", "dispatch", "dryRun", "executionBlocked", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.search.fetch" },
      target: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "runtime-fetch"] },
      resultEnvelope: { type: "object" },
    },
  }),
  riskLevel: "normal",
  permissionHints: ["network:read", "search:fetch"],
  dependencies: searchFetchDependencyDeclarations,
  storagePolicy: { storesMaterial: true, storesResult: true, storesAudit: true, reusable: true },
  sourcePath: entrySourcePath(),
  metadata: { storagePracticePath: path.join(storageRoot, "bestPractice.ts").split(path.sep).join("/") },
};

export const searchFetchHandler: BaseToolHandler<SearchFetchHandlerInput, SearchFetchOutput> = {
  definition: searchFetchBaseToolDefinition,
  async invoke(request) {
    if (!isRecord(request.input)) {
      return adaptResult(await planSearchFetchCore(request.input as SearchFetchRequest));
    }
    const selection = selectSearchFetchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.executor ?? request.input.provider,
    });
    const context = injectRuntimeMetadata(request, request.input.context, selection);
    return adaptResult(await planSearchFetchCore({ ...request.input, executor: selection.provider, context }));
  },
};
