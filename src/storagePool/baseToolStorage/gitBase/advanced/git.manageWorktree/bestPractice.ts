import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageWorktreePractice } from "./anthropic.js";
import { deepmindGitManageWorktreePractice } from "./deepmind.js";
import {
  executeGitManageWorktree as executeGitManageWorktreeCore,
  gitManageWorktreeDescriptor,
  parseGitManageWorktreeResult,
  planGitManageWorktree,
  planGitWorktreeManagement,
  type GitManageWorktreeOutput,
  type GitManageWorktreeProvider,
  type GitManageWorktreeRequest,
  type GitManageWorktreeResult,
} from "./core.js";
import {
  gitManageWorktreeDependencyDeclarations,
  type GitManageWorktreeDependencies,
  type GitManageWorktreePracticeProviderName,
  type GitManageWorktreeProviderPractice,
} from "./dependencies.js";
import { openaiGitManageWorktreePractice } from "./openai.js";

export * from "./core.js";

export type GitManageWorktreeBestPracticeRequest = GitManageWorktreeRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageWorktreePracticeProviderName;
};

export type GitManageWorktreeHandlerInput = Omit<GitManageWorktreeBestPracticeRequest, "executor">;

export type GitManageWorktreePracticeSelection = {
  providerName: GitManageWorktreePracticeProviderName;
  practice: GitManageWorktreeProviderPractice;
  provider?: GitManageWorktreeProvider;
};

export const gitManageWorktreeProviderPractices = [
  anthropicGitManageWorktreePractice,
  openaiGitManageWorktreePractice,
  deepmindGitManageWorktreePractice,
] as const;

export const gitManageWorktreeBestPracticeDescriptor = {
  toolId: "git.manageWorktree",
  bestPractice: "runtime-gitExecutor-manage-worktree",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageWorktreeDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(preferredProvider: GitManageWorktreePracticeProviderName | undefined): readonly GitManageWorktreeProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitManageWorktreeProviderPractices;
  }
  return [
    ...gitManageWorktreeProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageWorktreeProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageWorktreePractice(
  dependencies: GitManageWorktreeDependencies & { preferredProvider?: GitManageWorktreePracticeProviderName } = {},
): GitManageWorktreePracticeSelection {
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

function practiceAuditMetadata(selection: GitManageWorktreePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitManageWorktree(
  request: GitManageWorktreeBestPracticeRequest = {},
): ReturnType<typeof executeGitManageWorktreeCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitManageWorktreeBestPracticeRequest);
  const selection = selectGitManageWorktreePractice({
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
  return executeGitManageWorktreeCore({
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

export const gitManageWorktreeBaseToolDefinition = createGitBaseToolDefinition<
  GitManageWorktreeHandlerInput,
  GitManageWorktreeOutput
>({
  toolId: "git.manageWorktree",
  title: "Git Manage Worktree",
  description: "List or update Git worktrees through fixed git worktree actions.",
  summary: "Use git.manageWorktree to manage worktrees without exposing arbitrary git commands.",
  storageGroup: "advanced",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitManageWorktreeDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageWorktreeDescriptor.runtimeEntryPort,
    operationRisk: gitManageWorktreeDescriptor.operationRisk,
    allowedGitSubcommand: "worktree",
    argvMode: "fixed-manage-worktree",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.manageWorktree.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["list", "add", "remove", "prune"] },
          worktreePath: { type: "string" },
          targetRef: { type: "string" },
          branchName: { type: "string" },
          detach: { type: "boolean" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageWorktreeDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageWorktree.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.manageWorktree" },
      target: { type: "object" },
      runtimeEntry: { type: "object" },
      risk: { type: "object" },
      gitArgs: { type: "array", items: { type: "string" } },
      commandPreview: { type: "array", items: { type: "string" } },
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

export const gitManageWorktreeHandler: BaseToolHandler<GitManageWorktreeHandlerInput, GitManageWorktreeOutput> =
  createGitBaseCoreHandler(gitManageWorktreeBaseToolDefinition, async (request) => {
    const selection = selectGitManageWorktreePractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitManageWorktreeCore({
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
                { ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) },
                isRecord(inputContext.auditMetadata) ? inputContext.auditMetadata : undefined,
                request,
              ),
            }
          : request.input.context,
    });
  });

export type { GitManageWorktreeResult };
export { gitManageWorktreeDescriptor, parseGitManageWorktreeResult, planGitManageWorktree, planGitWorktreeManagement };
