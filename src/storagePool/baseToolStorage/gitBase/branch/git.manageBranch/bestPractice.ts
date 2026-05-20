import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitManageBranchPractice } from "./anthropic.js";
import { deepmindGitManageBranchPractice } from "./deepmind.js";
import {
  executeGitManageBranch as executeGitManageBranchCore,
  gitManageBranchDescriptor,
  parseGitManageBranchResult,
  planGitManageBranch,
  planGitBranchManagement,
  type GitManageBranchOutput,
  type GitManageBranchProvider,
  type GitManageBranchRequest,
  type GitManageBranchResult,
} from "./core.js";
import {
  gitManageBranchDependencyDeclarations,
  type GitManageBranchDependencies,
  type GitManageBranchPracticeProviderName,
  type GitManageBranchProviderPractice,
} from "./dependencies.js";
import { openaiGitManageBranchPractice } from "./openai.js";

export * from "./core.js";

export type GitManageBranchBestPracticeRequest = GitManageBranchRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitManageBranchPracticeProviderName;
};

export type GitManageBranchHandlerInput = Omit<GitManageBranchBestPracticeRequest, "executor">;

export type GitManageBranchPracticeSelection = {
  providerName: GitManageBranchPracticeProviderName;
  practice: GitManageBranchProviderPractice;
  provider?: GitManageBranchProvider;
};

export const gitManageBranchProviderPractices = [
  anthropicGitManageBranchPractice,
  openaiGitManageBranchPractice,
  deepmindGitManageBranchPractice,
] as const;

export const gitManageBranchBestPracticeDescriptor = {
  toolId: "git.manageBranch",
  bestPractice: "runtime-gitExecutor-manage-branch-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitManageBranchDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitManageBranchPracticeProviderName | undefined,
): readonly GitManageBranchProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitManageBranchProviderPractices;
  }
  return [
    ...gitManageBranchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitManageBranchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitManageBranchPractice(
  dependencies: GitManageBranchDependencies & {
    preferredProvider?: GitManageBranchPracticeProviderName;
  } = {},
): GitManageBranchPracticeSelection {
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

function practiceAuditMetadata(selection: GitManageBranchPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitManageBranch(
  request: GitManageBranchBestPracticeRequest = {},
): ReturnType<typeof executeGitManageBranchCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitManageBranchBestPracticeRequest);
  const selection = selectGitManageBranchPractice({
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
  return executeGitManageBranchCore({
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

export const gitManageBranchBaseToolDefinition = createGitBaseToolDefinition<
  GitManageBranchHandlerInput,
  GitManageBranchOutput
>({
  toolId: "git.manageBranch",
  title: "Git Manage Branch",
  description: "List, create, delete, rename, or set upstream branches through fixed git branch actions.",
  summary: "Use git.manageBranch to manage branches without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitManageBranchDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitManageBranchDescriptor.runtimeEntryPort,
    operationRisk: gitManageBranchDescriptor.operationRisk,
    allowedGitSubcommand: "branch",
    argvMode: "fixed-manage-branch",
    runtimeOwnsExecution: true,
    managesBranch: true,
  },
  inputSchema: jsonSchema("git.manageBranch.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          action: { type: "string", enum: ["list", "create", "delete", "rename", "set-upstream"] },
          branchName: { type: "string" },
          newBranchName: { type: "string" },
          startPoint: { type: "string" },
          upstream: { type: "string" },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitManageBranchDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.manageBranch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.manageBranch" },
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
      managesBranch: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitManageBranchHandler: BaseToolHandler<GitManageBranchHandlerInput, GitManageBranchOutput> =
  createGitBaseCoreHandler(gitManageBranchBaseToolDefinition, async (request) => {
    const selection = selectGitManageBranchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitManageBranchCore({
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

export type { GitManageBranchResult };
export { gitManageBranchDescriptor, parseGitManageBranchResult, planGitManageBranch, planGitBranchManagement };
