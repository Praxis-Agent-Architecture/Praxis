import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitMergeBranchPractice } from "./anthropic.js";
import { deepmindGitMergeBranchPractice } from "./deepmind.js";
import {
  executeGitMergeBranch as executeGitMergeBranchCore,
  gitMergeBranchDescriptor,
  parseGitMergeBranchResult,
  planGitBranchMerge,
  planGitMergeBranch,
  type GitMergeBranchOutput,
  type GitMergeBranchProvider,
  type GitMergeBranchRequest,
  type GitMergeBranchResult,
} from "./core.js";
import {
  gitMergeBranchDependencyDeclarations,
  type GitMergeBranchDependencies,
  type GitMergeBranchPracticeProviderName,
  type GitMergeBranchProviderPractice,
} from "./dependencies.js";
import { openaiGitMergeBranchPractice } from "./openai.js";

export * from "./core.js";

export type GitMergeBranchBestPracticeRequest = GitMergeBranchRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitMergeBranchPracticeProviderName;
};

export type GitMergeBranchHandlerInput = Omit<GitMergeBranchBestPracticeRequest, "executor">;

export type GitMergeBranchPracticeSelection = {
  providerName: GitMergeBranchPracticeProviderName;
  practice: GitMergeBranchProviderPractice;
  provider?: GitMergeBranchProvider;
};

export const gitMergeBranchProviderPractices = [
  anthropicGitMergeBranchPractice,
  openaiGitMergeBranchPractice,
  deepmindGitMergeBranchPractice,
] as const;

export const gitMergeBranchBestPracticeDescriptor = {
  toolId: "git.mergeBranch",
  bestPractice: "runtime-gitExecutor-merge-branch-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitMergeBranchDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitMergeBranchPracticeProviderName | undefined,
): readonly GitMergeBranchProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitMergeBranchProviderPractices;
  }
  return [
    ...gitMergeBranchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitMergeBranchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitMergeBranchPractice(
  dependencies: GitMergeBranchDependencies & {
    preferredProvider?: GitMergeBranchPracticeProviderName;
  } = {},
): GitMergeBranchPracticeSelection {
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

function practiceAuditMetadata(selection: GitMergeBranchPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitMergeBranch(
  request: GitMergeBranchBestPracticeRequest = {},
): ReturnType<typeof executeGitMergeBranchCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitMergeBranchBestPracticeRequest);
  const selection = selectGitMergeBranchPractice({
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
  return executeGitMergeBranchCore({
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

export const gitMergeBranchBaseToolDefinition = createGitBaseToolDefinition<
  GitMergeBranchHandlerInput,
  GitMergeBranchOutput
>({
  toolId: "git.mergeBranch",
  title: "Git Merge Branch",
  description: "Merge a safe source branch through a fixed git merge action.",
  summary: "Use git.mergeBranch to merge a branch without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitMergeBranchDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitMergeBranchDescriptor.runtimeEntryPort,
    operationRisk: gitMergeBranchDescriptor.operationRisk,
    allowedGitSubcommand: "merge",
    argvMode: "fixed-merge-branch-history-mutation",
    runtimeOwnsExecution: true,
    mergesBranch: true,
  },
  inputSchema: jsonSchema("git.mergeBranch.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "sourceBranch"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          sourceBranch: { type: "string", minLength: 1 },
          mode: { type: "string", enum: ["default", "ff-only", "no-ff", "squash"] },
          commitMessage: { type: "string" },
          noCommit: { type: "boolean" },
          allowUnrelatedHistories: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitMergeBranchDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.mergeBranch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.mergeBranch" },
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
      mergesBranch: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitMergeBranchHandler: BaseToolHandler<GitMergeBranchHandlerInput, GitMergeBranchOutput> =
  createGitBaseCoreHandler(gitMergeBranchBaseToolDefinition, async (request) => {
    const selection = selectGitMergeBranchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitMergeBranchCore({
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

export type { GitMergeBranchResult };
export { gitMergeBranchDescriptor, parseGitMergeBranchResult, planGitBranchMerge, planGitMergeBranch };
