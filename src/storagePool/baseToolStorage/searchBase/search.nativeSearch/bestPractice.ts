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
import { anthropicNativeSearchPractice } from "./anthropic.js";
import { deepmindNativeSearchPractice } from "./deepmind.js";
import { openaiNativeSearchPractice } from "./openai.js";
import {
  planNativeSearch as planNativeSearchCore,
  type NativeSearchContext,
  type NativeSearchExecutor,
  type NativeSearchOutput,
  type NativeSearchRequest,
  type NativeSearchResult,
} from "./core.js";
import {
  nativeSearchDependencyDeclarations,
  type NativeSearchDependencies,
  type NativeSearchPracticeProviderName,
  type NativeSearchProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type NativeSearchBestPracticeRequest = NativeSearchRequest & {
  executorPort?: BaseToolExecutorPort;
  preferredProvider?: NativeSearchPracticeProviderName;
};

export type NativeSearchHandlerInput = Omit<NativeSearchBestPracticeRequest, "executorPort">;

export type NativeSearchPracticeSelection = {
  providerName: NativeSearchPracticeProviderName;
  practice: NativeSearchProviderPractice;
  provider?: NativeSearchExecutor;
};

export const nativeSearchProviderPractices = [
  openaiNativeSearchPractice,
  anthropicNativeSearchPractice,
  deepmindNativeSearchPractice,
] as const;

export const nativeSearchBestPracticeDescriptor = {
  toolId: "search.nativeSearch",
  bestPractice: "storage-owned-provider-native-web-search-with-runtime-network-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["openai", "anthropic", "deepmind"],
  dependencies: nativeSearchDependencyDeclarations,
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
    .join(
      repoRoot,
      "src",
      "agentCore",
      "agent_executionEngine",
      "basic_toolLayer",
      "baseTools",
      "searchBase",
      "search.nativeSearch.ts",
    )
    .split(path.sep)
    .join("/");
}

function storageDocPath(): string {
  return path.join(storageRoot, "search.nativeSearch.md").split(path.sep).join("/");
}

function orderedPractices(
  preferredProvider: NativeSearchPracticeProviderName | undefined,
): readonly NativeSearchProviderPractice[] {
  if (preferredProvider === undefined || preferredProvider === "praxis-native") return nativeSearchProviderPractices;
  return [
    ...nativeSearchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...nativeSearchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectNativeSearchPractice(
  dependencies: NativeSearchDependencies & { preferredProvider?: NativeSearchPracticeProviderName } = {},
): NativeSearchPracticeSelection {
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
      notes: ["No injected runtime.network.nativeWebSearch provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: NativeSearchPracticeSelection): Readonly<Record<string, unknown>> {
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

function adaptResult(result: NativeSearchResult): BaseToolInvokeResult<NativeSearchOutput> {
  if (!result.ok) {
    return {
      ok: false,
      toolId: result.toolId,
      error: {
        code: result.error.code,
        message: result.error.message,
        publicSafe: true,
      },
      events: result.events,
    };
  }

  return {
    ok: true,
    toolId: result.toolId,
    output: result.output,
    events: result.events,
    metadata: {
      audit: result.audit,
    },
  };
}

function injectRuntimeMetadata(
  request: Pick<BaseToolInvokeRequest, "runtimeId" | "sessionId" | "toolCallId" | "metadata">,
  context: NativeSearchContext | undefined,
  selection: NativeSearchPracticeSelection,
): NativeSearchContext {
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

export async function executeNativeSearch(
  request: NativeSearchBestPracticeRequest = {},
): ReturnType<typeof planNativeSearchCore> {
  if (!isRecord(request)) {
    return planNativeSearchCore(request as NativeSearchRequest);
  }
  const selection = selectNativeSearchPractice({
    executor: request.executorPort,
    provider: request.executor ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return planNativeSearchCore({
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

export const planNativeSearch = executeNativeSearch;

export const nativeSearchBaseToolDefinition: BaseToolDefinition<NativeSearchHandlerInput, NativeSearchOutput> = {
  toolId: "search.nativeSearch",
  source: "builtin",
  family: "search",
  group: "(flat)",
  title: "Search Native Search",
  description: "Run provider-native web search through OpenAI, Anthropic, or DeepMind runtime backends.",
  toolSkill: {
    docPath: storageDocPath(),
    summary: "Use search.nativeSearch for official provider-native web search.",
    riskLevel: "normal",
  },
  inputSchema: jsonSchema("search.nativeSearch.input", {
    type: "object",
    additionalProperties: true,
    required: ["target"],
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["provider", "query"],
        properties: {
          provider: { type: "string", enum: ["openai", "anthropic", "deepmind"] },
          query: { type: "string" },
          model: { type: "string" },
          maxResults: { type: "integer", minimum: 1, maximum: 50 },
          recencyDays: { type: "integer", minimum: 1 },
          freshness: { type: "string", enum: ["any", "day", "week", "month", "year"] },
          allowedDomains: { type: "array", items: { type: "string" } },
          searchContextSize: { type: "string", enum: ["low", "medium", "high"] },
          userLocation: { type: "object", additionalProperties: true },
          citations: { type: "string", enum: ["required", "preferred", "off"] },
        },
      },
      context: {
        type: "object",
        additionalProperties: true,
        properties: {
          runtimeId: { type: "string" },
          sessionId: { type: "string" },
          invocationId: { type: "string" },
          dryRun: { type: "boolean" },
          guard: { type: "object", additionalProperties: true },
          allowedProviders: { type: "array", items: { type: "string" } },
          grantedPermissions: { type: "array", items: { type: "string" } },
        },
      },
      preferredProvider: { type: "string", enum: ["openai", "anthropic", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("search.nativeSearch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "requestPreview", "dispatch", "dryRun", "executionBlocked", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.search.nativeSearch" },
      target: { type: "object" },
      requestPreview: { type: "object" },
      dispatch: { type: "string", enum: ["dry-run", "provider-native"] },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
  riskLevel: "normal",
  permissionHints: ["network:search", "search:native"],
  dependencies: nativeSearchDependencyDeclarations,
  storagePolicy: {
    storesMaterial: true,
    storesResult: true,
    storesAudit: true,
    reusable: true,
  },
  sourcePath: entrySourcePath(),
  metadata: {
    storagePracticePath: path.join(storageRoot, "bestPractice.ts").split(path.sep).join("/"),
  },
};

export const nativeSearchHandler: BaseToolHandler<NativeSearchHandlerInput, NativeSearchOutput> = {
  definition: nativeSearchBaseToolDefinition,
  async invoke(request) {
    if (!isRecord(request.input)) {
      return adaptResult(await planNativeSearchCore(request.input as NativeSearchRequest));
    }
    const selection = selectNativeSearchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.executor ?? request.input.provider,
    });
    const context = injectRuntimeMetadata(request, request.input.context, selection);
    const result = await planNativeSearchCore({
      ...request.input,
      executor: selection.provider,
      context,
    });
    return adaptResult(result);
  },
};
