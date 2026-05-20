import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitRepositoryStatusPractice } from "./anthropic.js";
import { deepmindGitRepositoryStatusPractice } from "./deepmind.js";
import {
  executeGitRepositoryStatus as executeGitRepositoryStatusCore,
  gitGetRepositoryStatusDescriptor,
  planGitRepositoryStatusRead,
  type GitGetRepositoryStatusOutput,
  type GitGetRepositoryStatusRequest,
  type GitGetRepositoryStatusResult,
  type GitRepositoryStatusProvider,
} from "./core.js";
import {
  gitGetRepositoryStatusDependencyDeclarations,
  type GitGetRepositoryStatusDependencies,
  type GitGetRepositoryStatusPracticeProviderName,
  type GitGetRepositoryStatusProviderPractice,
} from "./dependencies.js";
import { openaiGitRepositoryStatusPractice } from "./openai.js";

export * from "./core.js";

export type GitGetRepositoryStatusBestPracticeRequest = GitGetRepositoryStatusRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitGetRepositoryStatusPracticeProviderName;
};

export type GitGetRepositoryStatusHandlerInput = Omit<GitGetRepositoryStatusBestPracticeRequest, "executor">;

export type GitGetRepositoryStatusPracticeSelection = {
  providerName: GitGetRepositoryStatusPracticeProviderName;
  practice: GitGetRepositoryStatusProviderPractice;
  provider?: GitRepositoryStatusProvider;
};

export const gitGetRepositoryStatusProviderPractices = [
  anthropicGitRepositoryStatusPractice,
  openaiGitRepositoryStatusPractice,
  deepmindGitRepositoryStatusPractice,
] as const;

export const gitGetRepositoryStatusBestPracticeDescriptor = {
  toolId: "git.getRepositoryStatus",
  bestPractice: "runtime-gitExecutor-status-read",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitGetRepositoryStatusDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitGetRepositoryStatusPracticeProviderName | undefined,
): readonly GitGetRepositoryStatusProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitGetRepositoryStatusProviderPractices;
  }

  return [
    ...gitGetRepositoryStatusProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitGetRepositoryStatusProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitGetRepositoryStatusPractice(
  dependencies: GitGetRepositoryStatusDependencies & {
    preferredProvider?: GitGetRepositoryStatusPracticeProviderName;
  } = {},
): GitGetRepositoryStatusPracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) {
      return {
        providerName: practice.providerName,
        practice,
        provider,
      };
    }
  }

  return {
    providerName: "praxis-native",
    practice: {
      providerName: "praxis-native",
      source: {
        kind: "praxis-native",
        label: "Praxis dry-run fallback",
      },
      directCliSupport: false,
      sideEffectPolicy: "runtime-governed",
      notes: ["No injected or runtime git provider is currently available; dry-run remains available."],
      createProvider: () => undefined,
    },
  };
}

function practiceAuditMetadata(selection: GitGetRepositoryStatusPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitRepositoryStatus(
  request: GitGetRepositoryStatusBestPracticeRequest = {},
): ReturnType<typeof executeGitRepositoryStatusCore> {
  const selection = selectGitGetRepositoryStatusPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitRepositoryStatusCore({
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

export const gitGetRepositoryStatusBaseToolDefinition = createGitBaseToolDefinition<
  GitGetRepositoryStatusHandlerInput,
  GitGetRepositoryStatusOutput
>({
  toolId: "git.getRepositoryStatus",
  title: "Git Repository Status",
  description: "Read repository status through the governed runtime git executor.",
  summary: "Use git.getRepositoryStatus to inspect branch and working tree status without mutating the repository.",
  storageGroup: "inspection",
  riskLevel: "normal",
  permissionHints: ["git:read", "filesystem:read"],
  dependencies: gitGetRepositoryStatusDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitGetRepositoryStatusDescriptor.runtimeEntryPort,
    operationRisk: gitGetRepositoryStatusDescriptor.operationRisk,
    allowedGitSubcommand: "status",
    argvMode: "fixed-status-read",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.getRepositoryStatus.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          includeBranch: { type: "boolean" },
          includeUntracked: { type: "boolean" },
          porcelainVersion: { type: "string", enum: ["v1", "v2"] },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitGetRepositoryStatusDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.getRepositoryStatus.output", {
    type: "object",
    additionalProperties: true,
    required: [
      "kind",
      "target",
      "runtimeEntry",
      "risk",
      "gitArgs",
      "commandPreview",
      "timeoutMs",
      "dryRun",
      "executionBlocked",
      "providerCalled",
      "resultEnvelope",
    ],
    properties: {
      kind: { const: "agentCore.basicTool.git.getRepositoryStatus" },
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

export const gitGetRepositoryStatusHandler: BaseToolHandler<
  GitGetRepositoryStatusHandlerInput,
  GitGetRepositoryStatusOutput
> = createGitBaseCoreHandler(gitGetRepositoryStatusBaseToolDefinition, async (request) => {
  const selection = selectGitGetRepositoryStatusPractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitRepositoryStatusCore({
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

export type { GitGetRepositoryStatusResult };
export { gitGetRepositoryStatusDescriptor, planGitRepositoryStatusRead };
