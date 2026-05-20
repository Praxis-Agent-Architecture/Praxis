import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitMoveOrRenameFilePractice } from "./anthropic.js";
import { deepmindGitMoveOrRenameFilePractice } from "./deepmind.js";
import {
  executeGitMoveOrRenameFile as executeGitMoveOrRenameFileCore,
  gitMoveOrRenameFileDescriptor,
  parseGitMoveOrRenameFileResult,
  planGitMoveOrRenameFile,
  type GitMoveOrRenameFileOutput,
  type GitMoveOrRenameFileProvider,
  type GitMoveOrRenameFileRequest,
  type GitMoveOrRenameFileResult,
} from "./core.js";
import {
  gitMoveOrRenameFileDependencyDeclarations,
  type GitMoveOrRenameFileDependencies,
  type GitMoveOrRenameFilePracticeProviderName,
  type GitMoveOrRenameFileProviderPractice,
} from "./dependencies.js";
import { openaiGitMoveOrRenameFilePractice } from "./openai.js";

export * from "./core.js";

export type GitMoveOrRenameFileBestPracticeRequest = GitMoveOrRenameFileRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitMoveOrRenameFilePracticeProviderName;
};

export type GitMoveOrRenameFileHandlerInput = Omit<GitMoveOrRenameFileBestPracticeRequest, "executor">;

export type GitMoveOrRenameFilePracticeSelection = {
  providerName: GitMoveOrRenameFilePracticeProviderName;
  practice: GitMoveOrRenameFileProviderPractice;
  provider?: GitMoveOrRenameFileProvider;
};

export const gitMoveOrRenameFileProviderPractices = [
  anthropicGitMoveOrRenameFilePractice,
  openaiGitMoveOrRenameFilePractice,
  deepmindGitMoveOrRenameFilePractice,
] as const;

export const gitMoveOrRenameFileBestPracticeDescriptor = {
  toolId: "git.moveOrRenameFile",
  bestPractice: "runtime-gitExecutor-move-or-rename-file-workspace-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitMoveOrRenameFileDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitMoveOrRenameFilePracticeProviderName | undefined,
): readonly GitMoveOrRenameFileProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitMoveOrRenameFileProviderPractices;
  }
  return [
    ...gitMoveOrRenameFileProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitMoveOrRenameFileProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitMoveOrRenameFilePractice(
  dependencies: GitMoveOrRenameFileDependencies & {
    preferredProvider?: GitMoveOrRenameFilePracticeProviderName;
  } = {},
): GitMoveOrRenameFilePracticeSelection {
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

function practiceAuditMetadata(selection: GitMoveOrRenameFilePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitMoveOrRenameFile(
  request: GitMoveOrRenameFileBestPracticeRequest = {},
): ReturnType<typeof executeGitMoveOrRenameFileCore> {
  const selection = selectGitMoveOrRenameFilePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitMoveOrRenameFileCore({
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

export const gitMoveOrRenameFileBaseToolDefinition = createGitBaseToolDefinition<
  GitMoveOrRenameFileHandlerInput,
  GitMoveOrRenameFileOutput
>({
  toolId: "git.moveOrRenameFile",
  title: "Git Move Or Rename File",
  description: "Move or rename a tracked file through a fixed git mv action.",
  summary: "Use git.moveOrRenameFile to move or rename a tracked file without exposing arbitrary git commands.",
  storageGroup: "file",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitMoveOrRenameFileDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitMoveOrRenameFileDescriptor.runtimeEntryPort,
    operationRisk: gitMoveOrRenameFileDescriptor.operationRisk,
    allowedGitSubcommand: "mv",
    argvMode: "fixed-move-or-rename-file-workspace-mutation",
    runtimeOwnsExecution: true,
    movesTrackedFile: true,
  },
  inputSchema: jsonSchema("git.moveOrRenameFile.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "sourcePath", "destinationPath"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          sourcePath: { type: "string", minLength: 1 },
          destinationPath: { type: "string", minLength: 1 },
          force: { type: "boolean" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitMoveOrRenameFileDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.moveOrRenameFile.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.moveOrRenameFile" },
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
      movesTrackedFile: { type: "boolean" },
      resultEnvelope: { type: "object" },
    },
  }),
});

export const gitMoveOrRenameFileHandler: BaseToolHandler<GitMoveOrRenameFileHandlerInput, GitMoveOrRenameFileOutput> =
  createGitBaseCoreHandler(gitMoveOrRenameFileBaseToolDefinition, async (request) => {
    const selection = selectGitMoveOrRenameFilePractice({
      ...request.input,
      executor: request.executor,
      provider: request.input.provider,
    });
    const inputContext = request.input.context ?? {};
    return executeGitMoveOrRenameFileCore({
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

export type { GitMoveOrRenameFileResult };
export { gitMoveOrRenameFileDescriptor, parseGitMoveOrRenameFileResult, planGitMoveOrRenameFile };
