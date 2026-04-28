import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitInitializeRepositoryPractice } from "./anthropic.js";
import { deepmindGitInitializeRepositoryPractice } from "./deepmind.js";
import {
  executeGitInitializeRepository as executeGitInitializeRepositoryCore,
  gitInitializeRepositoryDescriptor,
  parseGitInitializeRepositoryResult,
  planGitInitializeRepository,
  planGitRepositoryInitialization,
  type GitInitializeRepositoryOutput,
  type GitInitializeRepositoryProvider,
  type GitInitializeRepositoryRequest,
  type GitInitializeRepositoryResult,
} from "./core.js";
import {
  gitInitializeRepositoryDependencyDeclarations,
  type GitInitializeRepositoryDependencies,
  type GitInitializeRepositoryPracticeProviderName,
  type GitInitializeRepositoryProviderPractice,
} from "./dependencies.js";
import { openaiGitInitializeRepositoryPractice } from "./openai.js";

export * from "./core.js";

export type GitInitializeRepositoryBestPracticeRequest = GitInitializeRepositoryRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitInitializeRepositoryPracticeProviderName;
};

export type GitInitializeRepositoryHandlerInput = Omit<GitInitializeRepositoryBestPracticeRequest, "executor">;

export type GitInitializeRepositoryPracticeSelection = {
  providerName: GitInitializeRepositoryPracticeProviderName;
  practice: GitInitializeRepositoryProviderPractice;
  provider?: GitInitializeRepositoryProvider;
};

export const gitInitializeRepositoryProviderPractices = [
  anthropicGitInitializeRepositoryPractice,
  openaiGitInitializeRepositoryPractice,
  deepmindGitInitializeRepositoryPractice,
] as const;

export const gitInitializeRepositoryBestPracticeDescriptor = {
  toolId: "git.initializeRepository",
  bestPractice: "runtime-gitExecutor-initialize-repository-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitInitializeRepositoryDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitInitializeRepositoryPracticeProviderName | undefined,
): readonly GitInitializeRepositoryProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitInitializeRepositoryProviderPractices;
  }
  return [
    ...gitInitializeRepositoryProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitInitializeRepositoryProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitInitializeRepositoryPractice(
  dependencies: GitInitializeRepositoryDependencies & {
    preferredProvider?: GitInitializeRepositoryPracticeProviderName;
  } = {},
): GitInitializeRepositoryPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return { providerName: practice.providerName, practice, provider };
    }
  }
  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: { kind: "praxis-native", label: "Praxis dry-run fallback" },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or runtime git provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: GitInitializeRepositoryPracticeSelection): Readonly<Record<string, unknown>> {
  return buildGitBasePracticeAuditMetadata({
    providerName: selection.providerName,
    sourceLabel: selection.practice.source.label,
    sourceKind: selection.practice.source.kind,
    sourcePath: selection.practice.source.path,
    directCliSupport: selection.practice.directCliSupport,
    sideEffectPolicy: selection.practice.sideEffectPolicy,
    notes: selection.practice.notes,
  });
}

export async function executeGitInitializeRepository(
  request: GitInitializeRepositoryBestPracticeRequest = {},
): ReturnType<typeof executeGitInitializeRepositoryCore> {
  const safeRequest =
    typeof request === "object" && request !== null ? request : ({} as GitInitializeRepositoryBestPracticeRequest);
  const selection = selectGitInitializeRepositoryPractice({
    executor: safeRequest.executor,
    provider: safeRequest.provider,
    preferredProvider: safeRequest.preferredProvider,
  });
  const context =
    safeRequest.context === undefined || isRecord(safeRequest.context)
      ? {
          ...safeRequest.context,
          auditMetadata: {
            ...(safeRequest.context?.auditMetadata ?? {}),
            ...practiceAuditMetadata(selection),
          },
        }
      : safeRequest.context;
  return executeGitInitializeRepositoryCore({
    ...safeRequest,
    provider: selection.provider,
    context,
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
    guard: {
      type: "object",
      additionalProperties: true,
      properties: {
        allowed: { type: "boolean" },
        accepted: { type: "boolean" },
        reason: { type: "string" },
      },
    },
    allowedRepositoryRoots: { type: "array", items: { type: "string" } },
    grantedPermissions: { type: "array", items: { type: "string" } },
  },
} as const;

export const gitInitializeRepositoryBaseToolDefinition = createGitBaseToolDefinition<
  GitInitializeRepositoryHandlerInput,
  GitInitializeRepositoryOutput
>({
  toolId: "git.initializeRepository",
  title: "Git Initialize Repository",
  description: "Initialize a Git repository through a fixed git init action.",
  summary: "Use git.initializeRepository to initialize a repository without exposing arbitrary git commands.",
  storageGroup: "repository",
  riskLevel: "risky",
  permissionHints: ["git:write", "filesystem:write"],
  dependencies: gitInitializeRepositoryDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitInitializeRepositoryDescriptor.runtimeEntryPort,
    operationRisk: gitInitializeRepositoryDescriptor.operationRisk,
    allowedGitSubcommand: "init",
    argvMode: "fixed-initialize-repository",
    runtimeOwnsExecution: true,
    createsRepositoryMetadata: true,
  },
  inputSchema: jsonSchema("git.initializeRepository.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          initialBranch: { type: "string" },
          bare: { type: "boolean" },
          separateGitDir: { type: "string" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitInitializeRepositoryDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.initializeRepository.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.initializeRepository" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitInitializeRepositoryHandler: BaseToolHandler<GitInitializeRepositoryHandlerInput, GitInitializeRepositoryOutput> =
  createGitBaseCoreHandler(gitInitializeRepositoryBaseToolDefinition, async (request) => {
    const selection = selectGitInitializeRepositoryPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitInitializeRepositoryCore({
      ...request.input,
      provider: selection.provider,
      context:
        request.input.context === undefined || isRecord(request.input.context)
          ? {
              ...inputContext,
              runtimeId: inputContext.runtimeId ?? request.runtimeId,
              sessionId: inputContext.sessionId ?? request.sessionId,
              invocationId: inputContext.invocationId ?? request.toolCallId,
              auditMetadata: injectRuntimeInvocationMetadata(
                {
                  ...practiceAuditMetadata(selection),
                  ...(request.metadata ?? {}),
                },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitInitializeRepositoryResult };
export {
  gitInitializeRepositoryDescriptor,
  parseGitInitializeRepositoryResult,
  planGitInitializeRepository,
  planGitRepositoryInitialization,
};
