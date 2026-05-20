import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCloneRepositoryPractice } from "./anthropic.js";
import { deepmindGitCloneRepositoryPractice } from "./deepmind.js";
import {
  executeGitCloneRepository as executeGitCloneRepositoryCore,
  gitCloneRepositoryDescriptor,
  parseGitCloneRepositoryResult,
  planGitCloneRepository,
  planGitRepositoryClone,
  type GitCloneRepositoryOutput,
  type GitCloneRepositoryProvider,
  type GitCloneRepositoryRequest,
  type GitCloneRepositoryResult,
} from "./core.js";
import {
  gitCloneRepositoryDependencyDeclarations,
  type GitCloneRepositoryDependencies,
  type GitCloneRepositoryPracticeProviderName,
  type GitCloneRepositoryProviderPractice,
} from "./dependencies.js";
import { openaiGitCloneRepositoryPractice } from "./openai.js";

export * from "./core.js";

export type GitCloneRepositoryBestPracticeRequest = GitCloneRepositoryRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitCloneRepositoryPracticeProviderName;
};

export type GitCloneRepositoryHandlerInput = Omit<GitCloneRepositoryBestPracticeRequest, "executor">;

export type GitCloneRepositoryPracticeSelection = {
  providerName: GitCloneRepositoryPracticeProviderName;
  practice: GitCloneRepositoryProviderPractice;
  provider?: GitCloneRepositoryProvider;
};

export const gitCloneRepositoryProviderPractices = [
  anthropicGitCloneRepositoryPractice,
  openaiGitCloneRepositoryPractice,
  deepmindGitCloneRepositoryPractice,
] as const;

export const gitCloneRepositoryBestPracticeDescriptor = {
  toolId: "git.cloneRepository",
  bestPractice: "runtime-gitExecutor-clone-repository-remote-network",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitCloneRepositoryDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitCloneRepositoryPracticeProviderName | undefined,
): readonly GitCloneRepositoryProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitCloneRepositoryProviderPractices;
  }
  return [
    ...gitCloneRepositoryProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitCloneRepositoryProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitCloneRepositoryPractice(
  dependencies: GitCloneRepositoryDependencies & {
    preferredProvider?: GitCloneRepositoryPracticeProviderName;
  } = {},
): GitCloneRepositoryPracticeSelection {
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

function practiceAuditMetadata(selection: GitCloneRepositoryPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCloneRepository(
  request: GitCloneRepositoryBestPracticeRequest = {},
): ReturnType<typeof executeGitCloneRepositoryCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitCloneRepositoryBestPracticeRequest);
  const selection = selectGitCloneRepositoryPractice({
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
  return executeGitCloneRepositoryCore({
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

export const gitCloneRepositoryBaseToolDefinition = createGitBaseToolDefinition<
  GitCloneRepositoryHandlerInput,
  GitCloneRepositoryOutput
>({
  toolId: "git.cloneRepository",
  title: "Git Clone Repository",
  description: "Clone a Git repository through a fixed git clone action.",
  summary: "Use git.cloneRepository to clone a repository without exposing arbitrary git commands.",
  storageGroup: "repository",
  riskLevel: "risky",
  permissionHints: ["git:read", "filesystem:write"],
  dependencies: gitCloneRepositoryDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitCloneRepositoryDescriptor.runtimeEntryPort,
    operationRisk: gitCloneRepositoryDescriptor.operationRisk,
    allowedGitSubcommand: "clone",
    argvMode: "fixed-clone-repository",
    runtimeOwnsExecution: true,
    mayUseNetwork: true,
  },
  inputSchema: jsonSchema("git.cloneRepository.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["remoteUrl", "destinationPath"],
        properties: {
          repositoryPath: { type: "string" },
          remoteUrl: { type: "string", minLength: 1 },
          destinationPath: { type: "string", minLength: 1 },
          branch: { type: "string" },
          depth: { type: "integer", minimum: 1 },
          singleBranch: { type: "boolean" },
          bare: { type: "boolean" },
          mirror: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitCloneRepositoryDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.cloneRepository.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.cloneRepository" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
      timeoutMs: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      executionBlocked: { type: "boolean" },
      providerCalled: { type: "boolean" },
      mayUseNetwork: { type: "boolean" },
      exitCode: { type: "integer" },
      stdout: { type: "string" },
      stderr: { type: "string" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitCloneRepositoryHandler: BaseToolHandler<GitCloneRepositoryHandlerInput, GitCloneRepositoryOutput> =
  createGitBaseCoreHandler(gitCloneRepositoryBaseToolDefinition, async (request) => {
    const selection = selectGitCloneRepositoryPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitCloneRepositoryCore({
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

export type { GitCloneRepositoryResult };
export { gitCloneRepositoryDescriptor, parseGitCloneRepositoryResult, planGitCloneRepository, planGitRepositoryClone };
