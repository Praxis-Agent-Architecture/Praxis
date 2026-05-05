import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitAmendLastCommitPractice } from "./anthropic.js";
import { deepmindGitAmendLastCommitPractice } from "./deepmind.js";
import {
  executeGitAmendLastCommit as executeGitAmendLastCommitCore,
  gitAmendLastCommitDescriptor,
  parseGitAmendLastCommitResult,
  planGitAmendLastCommit,
  planGitLastCommitAmend,
  type GitAmendLastCommitOutput,
  type GitAmendLastCommitProvider,
  type GitAmendLastCommitRequest,
  type GitAmendLastCommitResult,
} from "./core.js";
import {
  gitAmendLastCommitDependencyDeclarations,
  type GitAmendLastCommitDependencies,
  type GitAmendLastCommitPracticeProviderName,
  type GitAmendLastCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitAmendLastCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitAmendLastCommitBestPracticeRequest = GitAmendLastCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitAmendLastCommitPracticeProviderName;
};

export type GitAmendLastCommitHandlerInput = Omit<GitAmendLastCommitBestPracticeRequest, "executor">;

export type GitAmendLastCommitPracticeSelection = {
  providerName: GitAmendLastCommitPracticeProviderName;
  practice: GitAmendLastCommitProviderPractice;
  provider?: GitAmendLastCommitProvider;
};

export const gitAmendLastCommitProviderPractices = [
  anthropicGitAmendLastCommitPractice,
  openaiGitAmendLastCommitPractice,
  deepmindGitAmendLastCommitPractice,
] as const;

export const gitAmendLastCommitBestPracticeDescriptor = {
  toolId: "git.amendLastCommit",
  bestPractice: "runtime-gitExecutor-amend-last-commit-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitAmendLastCommitDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitAmendLastCommitPracticeProviderName | undefined,
): readonly GitAmendLastCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitAmendLastCommitProviderPractices;
  }
  return [
    ...gitAmendLastCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitAmendLastCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitAmendLastCommitPractice(
  dependencies: GitAmendLastCommitDependencies & {
    preferredProvider?: GitAmendLastCommitPracticeProviderName;
  } = {},
): GitAmendLastCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitAmendLastCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitAmendLastCommit(
  request: GitAmendLastCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitAmendLastCommitCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitAmendLastCommitBestPracticeRequest);
  const selection = selectGitAmendLastCommitPractice({
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
  return executeGitAmendLastCommitCore({
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

export const gitAmendLastCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitAmendLastCommitHandlerInput,
  GitAmendLastCommitOutput
>({
  toolId: "git.amendLastCommit",
  title: "Git Amend Last Commit",
  description: "Amend the last commit through a fixed git commit --amend action.",
  summary: "Use git.amendLastCommit to amend the last commit without exposing arbitrary git commands.",
  storageGroup: "commit",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitAmendLastCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitAmendLastCommitDescriptor.runtimeEntryPort,
    operationRisk: gitAmendLastCommitDescriptor.operationRisk,
    allowedGitSubcommand: "commit",
    argvMode: "fixed-amend-last-commit",
    runtimeOwnsExecution: true,
    amendsCommit: true,
    rewritesHistory: true,
  },
  inputSchema: jsonSchema("git.amendLastCommit.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          commitMessage: { type: "string", minLength: 1 },
          noEdit: { type: "boolean" },
          includeAllTracked: { type: "boolean" },
          resetAuthor: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitAmendLastCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.amendLastCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.amendLastCommit" },
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
      amendsCommit: { type: "boolean" },
      rewritesHistory: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitAmendLastCommitHandler: BaseToolHandler<GitAmendLastCommitHandlerInput, GitAmendLastCommitOutput> =
  createGitBaseCoreHandler(gitAmendLastCommitBaseToolDefinition, async (request) => {
    const selection = selectGitAmendLastCommitPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitAmendLastCommitCore({
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

export type { GitAmendLastCommitResult };
export { gitAmendLastCommitDescriptor, parseGitAmendLastCommitResult, planGitAmendLastCommit, planGitLastCommitAmend };
