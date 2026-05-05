import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCreateCommitPractice } from "./anthropic.js";
import { deepmindGitCreateCommitPractice } from "./deepmind.js";
import {
  executeGitCreateCommit as executeGitCreateCommitCore,
  gitCreateCommitDescriptor,
  parseGitCreateCommitResult,
  planGitCreateCommit,
  planGitCommitCreation,
  type GitCreateCommitOutput,
  type GitCreateCommitProvider,
  type GitCreateCommitRequest,
  type GitCreateCommitResult,
} from "./core.js";
import {
  gitCreateCommitDependencyDeclarations,
  type GitCreateCommitDependencies,
  type GitCreateCommitPracticeProviderName,
  type GitCreateCommitProviderPractice,
} from "./dependencies.js";
import { openaiGitCreateCommitPractice } from "./openai.js";

export * from "./core.js";

export type GitCreateCommitBestPracticeRequest = GitCreateCommitRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitCreateCommitPracticeProviderName;
};

export type GitCreateCommitHandlerInput = Omit<GitCreateCommitBestPracticeRequest, "executor">;

export type GitCreateCommitPracticeSelection = {
  providerName: GitCreateCommitPracticeProviderName;
  practice: GitCreateCommitProviderPractice;
  provider?: GitCreateCommitProvider;
};

export const gitCreateCommitProviderPractices = [
  anthropicGitCreateCommitPractice,
  openaiGitCreateCommitPractice,
  deepmindGitCreateCommitPractice,
] as const;

export const gitCreateCommitBestPracticeDescriptor = {
  toolId: "git.createCommit",
  bestPractice: "runtime-gitExecutor-create-commit-history-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitCreateCommitDependencyDeclarations,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedPractices(
  preferredProvider: GitCreateCommitPracticeProviderName | undefined,
): readonly GitCreateCommitProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitCreateCommitProviderPractices;
  }
  return [
    ...gitCreateCommitProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitCreateCommitProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitCreateCommitPractice(
  dependencies: GitCreateCommitDependencies & {
    preferredProvider?: GitCreateCommitPracticeProviderName;
  } = {},
): GitCreateCommitPracticeSelection {
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

function practiceAuditMetadata(selection: GitCreateCommitPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCreateCommit(
  request: GitCreateCommitBestPracticeRequest = {},
): ReturnType<typeof executeGitCreateCommitCore> {
  const safeRequest = typeof request === "object" && request !== null ? request : ({} as GitCreateCommitBestPracticeRequest);
  const selection = selectGitCreateCommitPractice({
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
  return executeGitCreateCommitCore({
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

export const gitCreateCommitBaseToolDefinition = createGitBaseToolDefinition<
  GitCreateCommitHandlerInput,
  GitCreateCommitOutput
>({
  toolId: "git.createCommit",
  title: "Git Create Commit",
  description: "Create a commit through a fixed git commit action.",
  summary: "Use git.createCommit to create commits without exposing arbitrary git commands.",
  storageGroup: "commit",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitCreateCommitDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitCreateCommitDescriptor.runtimeEntryPort,
    operationRisk: gitCreateCommitDescriptor.operationRisk,
    allowedGitSubcommand: "commit",
    argvMode: "fixed-create-commit",
    runtimeOwnsExecution: true,
    createsCommit: true,
  },
  inputSchema: jsonSchema("git.createCommit.input", {
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
          includeAllTracked: { type: "boolean" },
          allowEmpty: { type: "boolean" },
          signoff: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitCreateCommitDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.createCommit.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.createCommit" },
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
      createsCommit: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitCreateCommitHandler: BaseToolHandler<GitCreateCommitHandlerInput, GitCreateCommitOutput> =
  createGitBaseCoreHandler(gitCreateCommitBaseToolDefinition, async (request) => {
    const selection = selectGitCreateCommitPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = isRecord(request.input.context) ? request.input.context : {};
    return executeGitCreateCommitCore({
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

export type { GitCreateCommitResult };
export { gitCreateCommitDescriptor, parseGitCreateCommitResult, planGitCreateCommit, planGitCommitCreation };
