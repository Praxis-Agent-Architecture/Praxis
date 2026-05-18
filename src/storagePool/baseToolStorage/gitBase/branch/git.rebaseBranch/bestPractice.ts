import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitRebaseBranchPractice } from "./anthropic.js";
import { deepmindGitRebaseBranchPractice } from "./deepmind.js";
import {
  executeGitRebaseBranch as executeGitRebaseBranchCore,
  gitRebaseBranchDescriptor,
  parseGitRebaseBranchResult,
  planGitBranchRebase,
  planGitRebaseBranch,
  type GitRebaseBranchOutput,
  type GitRebaseBranchProvider,
  type GitRebaseBranchRequest,
  type GitRebaseBranchResult,
} from "./core.js";
import {
  gitRebaseBranchDependencyDeclarations,
  type GitRebaseBranchDependencies,
  type GitRebaseBranchPracticeProviderName,
  type GitRebaseBranchProviderPractice,
} from "./dependencies.js";
import { openaiGitRebaseBranchPractice } from "./openai.js";

export * from "./core.js";

export type GitRebaseBranchBestPracticeRequest = GitRebaseBranchRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitRebaseBranchPracticeProviderName;
};

export type GitRebaseBranchHandlerInput = Omit<GitRebaseBranchBestPracticeRequest, "executor">;

export type GitRebaseBranchPracticeSelection = {
  providerName: GitRebaseBranchPracticeProviderName;
  practice: GitRebaseBranchProviderPractice;
  provider?: GitRebaseBranchProvider;
};

export const gitRebaseBranchProviderPractices = [
  anthropicGitRebaseBranchPractice,
  openaiGitRebaseBranchPractice,
  deepmindGitRebaseBranchPractice,
] as const;

export const gitRebaseBranchBestPracticeDescriptor = {
  toolId: "git.rebaseBranch",
  bestPractice: "runtime-gitExecutor-rebase-branch-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitRebaseBranchDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitRebaseBranchPracticeProviderName | undefined,
): readonly GitRebaseBranchProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitRebaseBranchProviderPractices;
  }
  return [
    ...gitRebaseBranchProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitRebaseBranchProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitRebaseBranchPractice(
  dependencies: GitRebaseBranchDependencies & {
    preferredProvider?: GitRebaseBranchPracticeProviderName;
  } = {},
): GitRebaseBranchPracticeSelection {
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

function practiceAuditMetadata(selection: GitRebaseBranchPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitRebaseBranch(
  request: GitRebaseBranchBestPracticeRequest = {},
): ReturnType<typeof executeGitRebaseBranchCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitRebaseBranchBestPracticeRequest);
  const selection = selectGitRebaseBranchPractice({
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
  return executeGitRebaseBranchCore({
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

export const gitRebaseBranchBaseToolDefinition = createGitBaseToolDefinition<
  GitRebaseBranchHandlerInput,
  GitRebaseBranchOutput
>({
  toolId: "git.rebaseBranch",
  title: "Git Rebase Branch",
  description: "Rebase a branch through a fixed git rebase action.",
  summary: "Use git.rebaseBranch to rebase a branch without exposing arbitrary git commands.",
  storageGroup: "branch",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitRebaseBranchDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitRebaseBranchDescriptor.runtimeEntryPort,
    operationRisk: gitRebaseBranchDescriptor.operationRisk,
    allowedGitSubcommand: "rebase",
    argvMode: "fixed-rebase-branch-history-mutation",
    runtimeOwnsExecution: true,
    rebasesBranch: true,
    rewritesHistory: true,
  },
  inputSchema: jsonSchema("git.rebaseBranch.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "upstreamRef"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          upstreamRef: { type: "string", minLength: 1 },
          branchName: { type: "string" },
          ontoRef: { type: "string" },
          keepBase: { type: "boolean" },
          autosquash: { type: "boolean" },
          interactive: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitRebaseBranchDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.rebaseBranch.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.rebaseBranch" },
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
      rebasesBranch: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitRebaseBranchHandler: BaseToolHandler<GitRebaseBranchHandlerInput, GitRebaseBranchOutput> =
  createGitBaseCoreHandler(gitRebaseBranchBaseToolDefinition, async (request) => {
    const selection = selectGitRebaseBranchPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitRebaseBranchCore({
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

export type { GitRebaseBranchResult };
export { gitRebaseBranchDescriptor, parseGitRebaseBranchResult, planGitBranchRebase, planGitRebaseBranch };
