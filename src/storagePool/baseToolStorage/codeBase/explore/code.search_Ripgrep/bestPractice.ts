import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { anthropicCodeSearchRipgrepPractice } from "./anthropic.js";
import { deepmindCodeSearchRipgrepPractice } from "./deepmind.js";
import { openaiCodeSearchRipgrepPractice } from "./openai.js";
import {
  buildCodeBasePracticeAuditMetadata,
  createCodeBaseCoreHandler,
  createCodeBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import {
  executeCodeSearchRipgrep as executeCodeSearchRipgrepCore,
  type CodeSearchRipgrepContext,
  type CodeSearchRipgrepExecutor,
  type CodeSearchRipgrepOutput,
  type CodeSearchRipgrepRequest,
} from "./core.js";
import {
  codeSearchRipgrepDependencyDeclarations,
  type CodeSearchRipgrepDependencies,
  type CodeSearchRipgrepPracticeProviderName,
  type CodeSearchRipgrepProviderPractice,
} from "./dependencies.js";

export * from "./core.js";

export type CodeSearchRipgrepBestPracticeRequest = CodeSearchRipgrepRequest & {
  executorPort?: BaseToolExecutorPort;
  preferredProvider?: CodeSearchRipgrepPracticeProviderName;
};

export type CodeSearchRipgrepHandlerInput = Omit<CodeSearchRipgrepBestPracticeRequest, "executorPort">;

export type CodeSearchRipgrepPracticeSelection = {
  providerName: CodeSearchRipgrepPracticeProviderName;
  practice: CodeSearchRipgrepProviderPractice;
  provider?: CodeSearchRipgrepExecutor;
};

export const codeSearchRipgrepProviderPractices = [
  anthropicCodeSearchRipgrepPractice,
  openaiCodeSearchRipgrepPractice,
  deepmindCodeSearchRipgrepPractice,
] as const;

export const codeSearchRipgrepBestPracticeDescriptor = {
  toolId: "code.search_Ripgrep",
  bestPractice: "storage-owned-code-search-with-runtime-ripgrep-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeSearchRipgrepDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: CodeSearchRipgrepPracticeProviderName | undefined,
): readonly CodeSearchRipgrepProviderPractice[] {
  if (preferredProvider === undefined) return codeSearchRipgrepProviderPractices;
  return [
    ...codeSearchRipgrepProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...codeSearchRipgrepProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectCodeSearchRipgrepPractice(
  dependencies: CodeSearchRipgrepDependencies & { preferredProvider?: CodeSearchRipgrepPracticeProviderName } = {},
): CodeSearchRipgrepPracticeSelection {
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
      notes: ["No injected or host ripgrep-style search provider is available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: CodeSearchRipgrepPracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeCodeSearchRipgrep(
  request: CodeSearchRipgrepBestPracticeRequest = {},
): ReturnType<typeof executeCodeSearchRipgrepCore> {
  const selection = selectCodeSearchRipgrepPractice({
    executor: request.executorPort,
    provider: request.executor ?? request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeCodeSearchRipgrepCore({
    ...request,
    executor: selection.provider,
    context: {
      ...request.context,
      auditMetadata: {
        ...(request.context?.auditMetadata ?? {}),
        ...practiceAuditMetadata(selection),
      },
    },
  });
}

const invocationContextSchema = {
  type: "object",
  additionalProperties: true,
  properties: {
    runtimeId: { type: "string" },
    sessionId: { type: "string" },
    invocationId: { type: "string" },
    dryRun: { type: "boolean" },
    workspaceRoot: { type: "string" },
    allowedRoots: { type: "array", items: { type: "string" } },
    guard: { type: "object", additionalProperties: true },
  },
} as const;

export const codeSearchRipgrepBaseToolDefinition = createCodeBaseToolDefinition<
  CodeSearchRipgrepHandlerInput,
  CodeSearchRipgrepOutput
>({
  toolId: "code.search_Ripgrep",
  title: "Code Search Ripgrep",
  description: "Search code text through a governed ripgrep-style runtime provider.",
  summary: "Use code.search_Ripgrep for precise text search without shell.",
  storageGroup: "explore",
  riskLevel: "normal",
  permissionHints: ["filesystem:read"],
  dependencies: codeSearchRipgrepDependencyDeclarations,
  inputSchema: jsonSchema("code.search_Ripgrep.input", {
    type: "object",
    additionalProperties: true,
    required: ["query", "directoryPath"],
    properties: {
      query: { type: "string" },
      pattern: { type: "string" },
      directoryPath: { type: "string" },
      fileGlob: { type: "string" },
      maxMatches: { type: "integer", minimum: 1 },
      literal: { type: "boolean" },
      caseSensitive: { type: "boolean" },
      includeHidden: { type: "boolean" },
      multiline: { type: "boolean" },
      contextLines: { type: "integer", minimum: 0, maximum: 20 },
      context: invocationContextSchema,
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("code.search_Ripgrep.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "matches", "exitCode", "truncated"],
    properties: {
      kind: { const: "agentCore.basicTool.code.search_Ripgrep.output" },
      matches: { type: "array" },
      exitCode: { type: "integer" },
      stderr: { type: "string" },
      truncated: { type: "boolean" },
    },
  }),
});

export const codeSearchRipgrepHandler: BaseToolHandler<
  CodeSearchRipgrepHandlerInput,
  CodeSearchRipgrepOutput
> = createCodeBaseCoreHandler(codeSearchRipgrepBaseToolDefinition, async (request) => {
  const selection = selectCodeSearchRipgrepPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.executor ?? request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  const context: CodeSearchRipgrepContext = {
    ...inputContext,
    runtimeId: inputContext.runtimeId ?? request.runtimeId,
    sessionId: inputContext.sessionId ?? request.sessionId,
    invocationId: inputContext.invocationId ?? request.toolCallId,
    auditMetadata: injectRuntimeInvocationMetadata(
      { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
      inputContext.auditMetadata,
      request,
    ),
  };
  return executeCodeSearchRipgrepCore({
    ...request.input,
    executor: selection.provider,
    context,
  });
});
