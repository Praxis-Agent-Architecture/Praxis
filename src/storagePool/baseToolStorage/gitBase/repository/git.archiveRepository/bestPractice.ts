import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitArchiveRepositoryPractice } from "./anthropic.js";
import { deepmindGitArchiveRepositoryPractice } from "./deepmind.js";
import {
  executeGitArchiveRepository as executeGitArchiveRepositoryCore,
  gitArchiveRepositoryDescriptor,
  parseGitArchiveRepositoryResult,
  planGitArchiveRepository,
  planGitRepositoryArchive,
  type GitArchiveRepositoryOutput,
  type GitArchiveRepositoryProvider,
  type GitArchiveRepositoryRequest,
  type GitArchiveRepositoryResult,
} from "./core.js";
import {
  gitArchiveRepositoryDependencyDeclarations,
  type GitArchiveRepositoryDependencies,
  type GitArchiveRepositoryPracticeProviderName,
  type GitArchiveRepositoryProviderPractice,
} from "./dependencies.js";
import { openaiGitArchiveRepositoryPractice } from "./openai.js";

export * from "./core.js";

export type GitArchiveRepositoryBestPracticeRequest = GitArchiveRepositoryRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitArchiveRepositoryPracticeProviderName;
};

export type GitArchiveRepositoryHandlerInput = Omit<GitArchiveRepositoryBestPracticeRequest, "executor">;

export type GitArchiveRepositoryPracticeSelection = {
  providerName: GitArchiveRepositoryPracticeProviderName;
  practice: GitArchiveRepositoryProviderPractice;
  provider?: GitArchiveRepositoryProvider;
};

export const gitArchiveRepositoryProviderPractices = [
  anthropicGitArchiveRepositoryPractice,
  openaiGitArchiveRepositoryPractice,
  deepmindGitArchiveRepositoryPractice,
] as const;

export const gitArchiveRepositoryBestPracticeDescriptor = {
  toolId: "git.archiveRepository",
  bestPractice: "runtime-gitExecutor-archive-repository-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitArchiveRepositoryDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitArchiveRepositoryPracticeProviderName | undefined,
): readonly GitArchiveRepositoryProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitArchiveRepositoryProviderPractices;
  }
  return [
    ...gitArchiveRepositoryProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitArchiveRepositoryProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitArchiveRepositoryPractice(
  dependencies: GitArchiveRepositoryDependencies & {
    preferredProvider?: GitArchiveRepositoryPracticeProviderName;
  } = {},
): GitArchiveRepositoryPracticeSelection {
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

function practiceAuditMetadata(selection: GitArchiveRepositoryPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitArchiveRepository(
  request: GitArchiveRepositoryBestPracticeRequest = {},
): ReturnType<typeof executeGitArchiveRepositoryCore> {
  const safeRequest =
    typeof request === "object" && request !== null ? request : ({} as GitArchiveRepositoryBestPracticeRequest);
  const selection = selectGitArchiveRepositoryPractice({
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
  return executeGitArchiveRepositoryCore({
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

export const gitArchiveRepositoryBaseToolDefinition = createGitBaseToolDefinition<
  GitArchiveRepositoryHandlerInput,
  GitArchiveRepositoryOutput
>({
  toolId: "git.archiveRepository",
  title: "Git Archive Repository",
  description: "Write a Git archive through a fixed git archive action.",
  summary: "Use git.archiveRepository to create an archive without exposing arbitrary git commands.",
  storageGroup: "repository",
  riskLevel: "risky",
  permissionHints: ["git:read", "filesystem:write"],
  dependencies: gitArchiveRepositoryDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitArchiveRepositoryDescriptor.runtimeEntryPort,
    operationRisk: gitArchiveRepositoryDescriptor.operationRisk,
    allowedGitSubcommand: "archive",
    argvMode: "fixed-archive-repository",
    runtimeOwnsExecution: true,
    writesArchiveFile: true,
  },
  inputSchema: jsonSchema("git.archiveRepository.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "outputPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          outputPath: { type: "string", minLength: 1 },
          ref: { type: "string" },
          format: { type: "string", enum: ["tar", "zip"] },
          pathspecs: { type: "array", items: { type: "string" } },
          prefix: { type: "string" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitArchiveRepositoryDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.archiveRepository.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.archiveRepository" },
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

export const gitArchiveRepositoryHandler: BaseToolHandler<GitArchiveRepositoryHandlerInput, GitArchiveRepositoryOutput> =
  createGitBaseCoreHandler(gitArchiveRepositoryBaseToolDefinition, async (request) => {
    const selection = selectGitArchiveRepositoryPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitArchiveRepositoryCore({
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

export type { GitArchiveRepositoryResult };
export {
  gitArchiveRepositoryDescriptor,
  parseGitArchiveRepositoryResult,
  planGitArchiveRepository,
  planGitRepositoryArchive,
};
