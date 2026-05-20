import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitCleanUntrackedFilesPractice } from "./anthropic.js";
import { deepmindGitCleanUntrackedFilesPractice } from "./deepmind.js";
import {
  executeGitCleanUntrackedFiles as executeGitCleanUntrackedFilesCore,
  gitCleanUntrackedFilesDescriptor,
  planGitCleanUntrackedFiles,
  type GitCleanUntrackedFilesOutput,
  type GitCleanUntrackedFilesProvider,
  type GitCleanUntrackedFilesRequest,
  type GitCleanUntrackedFilesResult,
} from "./core.js";
import {
  gitCleanUntrackedFilesDependencyDeclarations,
  type GitCleanUntrackedFilesDependencies,
  type GitCleanUntrackedFilesPracticeProviderName,
  type GitCleanUntrackedFilesProviderPractice,
} from "./dependencies.js";
import { openaiGitCleanUntrackedFilesPractice } from "./openai.js";

export * from "./core.js";

export type GitCleanUntrackedFilesBestPracticeRequest = GitCleanUntrackedFilesRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitCleanUntrackedFilesPracticeProviderName;
};

export type GitCleanUntrackedFilesHandlerInput = Omit<GitCleanUntrackedFilesBestPracticeRequest, "executor">;

export type GitCleanUntrackedFilesPracticeSelection = {
  providerName: GitCleanUntrackedFilesPracticeProviderName;
  practice: GitCleanUntrackedFilesProviderPractice;
  provider?: GitCleanUntrackedFilesProvider;
};

export const gitCleanUntrackedFilesProviderPractices = [
  anthropicGitCleanUntrackedFilesPractice,
  openaiGitCleanUntrackedFilesPractice,
  deepmindGitCleanUntrackedFilesPractice,
] as const;

export const gitCleanUntrackedFilesBestPracticeDescriptor = {
  toolId: "git.cleanUntrackedFiles",
  bestPractice: "runtime-gitExecutor-clean-untracked-workspace-deletion",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitCleanUntrackedFilesDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitCleanUntrackedFilesPracticeProviderName | undefined,
): readonly GitCleanUntrackedFilesProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitCleanUntrackedFilesProviderPractices;
  }
  return [
    ...gitCleanUntrackedFilesProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitCleanUntrackedFilesProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitCleanUntrackedFilesPractice(
  dependencies: GitCleanUntrackedFilesDependencies & {
    preferredProvider?: GitCleanUntrackedFilesPracticeProviderName;
  } = {},
): GitCleanUntrackedFilesPracticeSelection {
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

function practiceAuditMetadata(selection: GitCleanUntrackedFilesPracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitCleanUntrackedFiles(
  request: GitCleanUntrackedFilesBestPracticeRequest = {},
): ReturnType<typeof executeGitCleanUntrackedFilesCore> {
  const selection = selectGitCleanUntrackedFilesPractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitCleanUntrackedFilesCore({
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

export const gitCleanUntrackedFilesBaseToolDefinition = createGitBaseToolDefinition<
  GitCleanUntrackedFilesHandlerInput,
  GitCleanUntrackedFilesOutput
>({
  toolId: "git.cleanUntrackedFiles",
  title: "Git Clean Untracked Files",
  description: "Delete untracked files through a fixed git clean action.",
  summary: "Use git.cleanUntrackedFiles to clean untracked files without exposing arbitrary git commands.",
  storageGroup: "stash",
  riskLevel: "dangerous",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitCleanUntrackedFilesDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitCleanUntrackedFilesDescriptor.runtimeEntryPort,
    operationRisk: gitCleanUntrackedFilesDescriptor.operationRisk,
    allowedGitSubcommand: "clean",
    argvMode: "fixed-clean-untracked-workspace-deletion",
    runtimeOwnsExecution: true,
    deletesUntrackedFiles: true,
  },
  inputSchema: jsonSchema("git.cleanUntrackedFiles.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          paths: { type: "array", items: { type: "string" } },
          includeDirectories: { type: "boolean" },
          ignoredMode: { type: "string", enum: ["tracked-ignored", "ignored-only", "none"] },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitCleanUntrackedFilesDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.cleanUntrackedFiles.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.cleanUntrackedFiles" },
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
      deletesUntrackedFiles: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitCleanUntrackedFilesHandler: BaseToolHandler<GitCleanUntrackedFilesHandlerInput, GitCleanUntrackedFilesOutput> =
  createGitBaseCoreHandler(gitCleanUntrackedFilesBaseToolDefinition, async (request) => {
    const selection = selectGitCleanUntrackedFilesPractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitCleanUntrackedFilesCore({
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

export type { GitCleanUntrackedFilesResult };
export { gitCleanUntrackedFilesDescriptor, planGitCleanUntrackedFiles };
