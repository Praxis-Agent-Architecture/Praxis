import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import {
  buildGitBasePracticeAuditMetadata,
  createGitBaseCoreHandler,
  createGitBaseToolDefinition,
  injectRuntimeInvocationMetadata,
  jsonSchema,
} from "../../_shared/baseToolAdapter.js";
import { anthropicGitRestoreWorkingTreePractice } from "./anthropic.js";
import { deepmindGitRestoreWorkingTreePractice } from "./deepmind.js";
import {
  executeGitRestoreWorkingTree as executeGitRestoreWorkingTreeCore,
  gitRestoreWorkingTreeDescriptor,
  planGitRestoreWorkingTree,
  type GitRestoreWorkingTreeOutput,
  type GitRestoreWorkingTreeProvider,
  type GitRestoreWorkingTreeRequest,
  type GitRestoreWorkingTreeResult,
} from "./core.js";
import {
  gitRestoreWorkingTreeDependencyDeclarations,
  type GitRestoreWorkingTreeDependencies,
  type GitRestoreWorkingTreePracticeProviderName,
  type GitRestoreWorkingTreeProviderPractice,
} from "./dependencies.js";
import { openaiGitRestoreWorkingTreePractice } from "./openai.js";

export * from "./core.js";

export type GitRestoreWorkingTreeBestPracticeRequest = GitRestoreWorkingTreeRequest & {
  executor?: BaseToolExecutorPort;
  preferredProvider?: GitRestoreWorkingTreePracticeProviderName;
};

export type GitRestoreWorkingTreeHandlerInput = Omit<GitRestoreWorkingTreeBestPracticeRequest, "executor">;

export type GitRestoreWorkingTreePracticeSelection = {
  providerName: GitRestoreWorkingTreePracticeProviderName;
  practice: GitRestoreWorkingTreeProviderPractice;
  provider?: GitRestoreWorkingTreeProvider;
};

export const gitRestoreWorkingTreeProviderPractices = [
  anthropicGitRestoreWorkingTreePractice,
  openaiGitRestoreWorkingTreePractice,
  deepmindGitRestoreWorkingTreePractice,
] as const;

export const gitRestoreWorkingTreeBestPracticeDescriptor = {
  toolId: "git.restoreWorkingTree",
  bestPractice: "runtime-gitExecutor-restore-worktree-mutation",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: gitRestoreWorkingTreeDependencyDeclarations,
} as const;

function orderedPractices(
  preferredProvider: GitRestoreWorkingTreePracticeProviderName | undefined,
): readonly GitRestoreWorkingTreeProviderPractice[] {
  if (preferredProvider === undefined) {
    return gitRestoreWorkingTreeProviderPractices;
  }
  return [
    ...gitRestoreWorkingTreeProviderPractices.filter((practice) => practice.providerName === preferredProvider),
    ...gitRestoreWorkingTreeProviderPractices.filter((practice) => practice.providerName !== preferredProvider),
  ];
}

export function selectGitRestoreWorkingTreePractice(
  dependencies: GitRestoreWorkingTreeDependencies & {
    preferredProvider?: GitRestoreWorkingTreePracticeProviderName;
  } = {},
): GitRestoreWorkingTreePracticeSelection {
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

function practiceAuditMetadata(selection: GitRestoreWorkingTreePracticeSelection): Readonly<Record<string, unknown>> {
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

export async function executeGitRestoreWorkingTree(
  request: GitRestoreWorkingTreeBestPracticeRequest = {},
): ReturnType<typeof executeGitRestoreWorkingTreeCore> {
  const selection = selectGitRestoreWorkingTreePractice({
    executor: request.executor,
    provider: request.provider,
    preferredProvider: request.preferredProvider,
  });
  return executeGitRestoreWorkingTreeCore({
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

export const gitRestoreWorkingTreeBaseToolDefinition = createGitBaseToolDefinition<
  GitRestoreWorkingTreeHandlerInput,
  GitRestoreWorkingTreeOutput
>({
  toolId: "git.restoreWorkingTree",
  title: "Git Restore Working Tree",
  description: "Restore repository-relative working-tree paths through a fixed git restore action.",
  summary: "Use git.restoreWorkingTree to discard or source-restore working-tree changes without exposing arbitrary git commands.",
  storageGroup: "staging",
  riskLevel: "risky",
  permissionHints: ["git:read", "git:write", "filesystem:read", "filesystem:write"],
  dependencies: gitRestoreWorkingTreeDependencyDeclarations,
  metadata: {
    runtimeEntryPort: gitRestoreWorkingTreeDescriptor.runtimeEntryPort,
    operationRisk: gitRestoreWorkingTreeDescriptor.operationRisk,
    allowedGitSubcommand: "restore",
    argvMode: "fixed-restore-worktree-mutation",
    runtimeOwnsExecution: true,
  },
  inputSchema: jsonSchema("git.restoreWorkingTree.input", {
    type: "object",
    additionalProperties: true,
    properties: {
      target: {
        type: "object",
        additionalProperties: true,
        required: ["repositoryPath", "paths"],
        properties: {
          repositoryPath: { type: "string", minLength: 1 },
          paths: { type: "array", items: { type: "string" } },
          sourceRef: { type: "string" },
        },
      },
      context: invocationContextSchema,
      timeoutMs: { type: "integer", minimum: 1, maximum: gitRestoreWorkingTreeDescriptor.maxTimeoutMs },
      preferredProvider: { type: "string", enum: ["anthropic", "openai", "deepmind", "praxis-native"] },
    },
  }),
  outputSchema: jsonSchema("git.restoreWorkingTree.output", {
    type: "object",
    additionalProperties: true,
    required: ["kind", "target", "runtimeEntry", "risk", "gitArgs", "commandPreview", "dryRun", "providerCalled", "resultEnvelope"],
    properties: {
      kind: { const: "agentCore.basicTool.git.restoreWorkingTree" },
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

export const gitRestoreWorkingTreeHandler: BaseToolHandler<
  GitRestoreWorkingTreeHandlerInput,
  GitRestoreWorkingTreeOutput
> = createGitBaseCoreHandler(gitRestoreWorkingTreeBaseToolDefinition, async (request) => {
  const selection = selectGitRestoreWorkingTreePractice({
    ...request.input,
    executor: request.executor,
    provider: request.input.provider,
  });
  const inputContext = request.input.context ?? {};
  return executeGitRestoreWorkingTreeCore({
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

export type { GitRestoreWorkingTreeResult };
export { gitRestoreWorkingTreeDescriptor, planGitRestoreWorkingTree };
