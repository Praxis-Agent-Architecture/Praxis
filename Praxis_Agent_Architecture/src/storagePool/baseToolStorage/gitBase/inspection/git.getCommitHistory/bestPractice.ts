import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCommitHistoryPractice } from "./anthropic.js";
import { deepmindGitCommitHistoryPractice } from "./deepmind.js";
import {
  executeGitCommitHistory as executeGitCommitHistoryCore,
  gitGetCommitHistoryDescriptor,
  planGitCommitHistoryRead,
  type GitCommitHistoryProvider,
  type GitGetCommitHistoryOutput,
  type GitGetCommitHistoryRequest,
  type GitGetCommitHistoryResult,
} from "./core.js";
import {
  gitGetCommitHistoryDependencyDeclarations,
  type GitGetCommitHistoryDependencies,
  type GitGetCommitHistoryPracticeProviderName,
  type GitGetCommitHistoryProviderPractice,
} from "./dependencies.js";
import { openaiGitCommitHistoryPractice } from "./openai.js";

export * from "./core.js";

export type GitGetCommitHistoryBestPracticeRequest = GitGetCommitHistoryRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitGetCommitHistoryPracticeProviderName;
};

export type GitGetCommitHistoryHandlerInput = Omit<GitGetCommitHistoryBestPracticeRequest, "executor">;

export type GitGetCommitHistoryPracticeSelection = {
  providerName: GitGetCommitHistoryPracticeProviderName;
  practice: GitGetCommitHistoryProviderPractice;
  provider?: GitCommitHistoryProvider;
};

export const gitGetCommitHistoryProviderPractices = [
  anthropicGitCommitHistoryPractice,
  openaiGitCommitHistoryPractice,
  deepmindGitCommitHistoryPractice,
] as const;

export const gitGetCommitHistoryBestPracticeDescriptor = {
  toolId: "git.getCommitHistory",
  bestPractice: "runtime-gitExecutor-log-read",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitGetCommitHistoryDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitGetCommitHistoryPracticeProviderName | undefined,
): readonly GitGetCommitHistoryProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitGetCommitHistoryProviderPractices;
  }
  return [
    ...gitGetCommitHistoryProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitGetCommitHistoryProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitGetCommitHistoryPractice(
  dependencies: GitGetCommitHistoryDependencies & {
    preferredProvider?: GitGetCommitHistoryPracticeProviderName;
  } = {},
): GitGetCommitHistoryPracticeSelection {
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

function practiceAuditMetadata(selection: GitGetCommitHistoryPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCommitHistory(
  request: GitGetCommitHistoryBestPracticeRequest = {},
): ReturnType<typeof executeGitCommitHistoryCore> {
  const selection = selectGitGetCommitHistoryPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitCommitHistoryCore({
    ...request,
    provider: selection.provider,
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

export const gitGetCommitHistoryBaseToolDefinition = createGitBaseToolDefinition<
  GitGetCommitHistoryHandlerInput,
  GitGetCommitHistoryOutput
>({
  toolId: "git.getCommitHistory",
  title: "Git Commit History",
  description: "Read commit history through the governed runtime git executor.",
  summary: "Use git.getCommitHistory to inspect recent commits without mutating repository state.",
  storageGroup: "inspection",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitGetCommitHistoryDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitGetCommitHistoryDescriptor.runtimeEntryPort,
    operationRisk: gitGetCommitHistoryDescriptor.operationRisk,
    allowedGitSubcommand: "log",
    argvMode: "fixed-log-read",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.getCommitHistory.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          maxCount: { type: "integer", minimum: 1, maximum: gitGetCommitHistoryDescriptor.maxAllowedCount },
          ref: { type: "string" },
          pathFilter: { type: "string" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitGetCommitHistoryDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.getCommitHistory.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.getCommitHistory" },
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

export const gitGetCommitHistoryHandler: BaseToolHandler<
  GitGetCommitHistoryHandlerInput,
  GitGetCommitHistoryOutput
> = createGitBaseCoreHandler(gitGetCommitHistoryBaseToolDefinition, async (request) => {
  const selection = selectGitGetCommitHistoryPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitCommitHistoryCore({
    ...request.input,
    provider: selection.provider,
    context: {
      ...inputContext,
      runtimeId: inputContext.runtimeId ?? request.runtimeId,
      sessionId: inputContext.sessionId ?? request.sessionId,
      invocationId: inputContext.invocationId ?? request.toolCallId,
      auditMetadata: injectRuntimeInvocationMetadata(
        {
          ...practiceAuditMetadata(selection),
          ...(request.metadata ?? {}),
        },
        inputContext.auditMetadata,
        request,
      ),
    },
  });
});

export type { GitGetCommitHistoryResult };
export { gitGetCommitHistoryDescriptor, planGitCommitHistoryRead };
