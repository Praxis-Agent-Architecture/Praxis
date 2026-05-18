import type { BaseToolExecutorPort } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore/agent_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { CodeEditContext } from "../_shared/editCore.js";
import { anthropicCodeOverwritePractice } from "./anthropic.js";
import { deepmindCodeOverwritePractice } from "./deepmind.js";
import { codeOverwriteDependencyDeclarations, type CodeOverwriteDependencies, type CodeOverwritePracticeProviderName, type CodeOverwriteProviderPractice } from "./dependencies.js";
import { openaiCodeOverwritePractice } from "./openai.js";
import {
  codeOverwriteDescriptor,
  executeCodeOverwrite as executeCodeOverwriteCore,
  planCodeOverwrite,
  type CodeOverwriteOutput,
  type CodeOverwriteProvider,
  type CodeOverwriteRequest,
  type CodeOverwriteResult,
} from "./core.js";

export * from "./core.js";

export type CodeOverwriteBestPracticeRequest = CodeOverwriteRequest & { executor?: BaseToolExecutorPort; preferredProvider?: CodeOverwritePracticeProviderName };
export type CodeOverwriteHandlerInput = Omit<CodeOverwriteBestPracticeRequest, "executor">;
export type CodeOverwritePracticeSelection = { providerName: CodeOverwritePracticeProviderName; practice: CodeOverwriteProviderPractice; provider?: CodeOverwriteProvider };

export const codeOverwriteProviderPractices = [anthropicCodeOverwritePractice, openaiCodeOverwritePractice, deepmindCodeOverwritePractice] as const;
export const codeOverwriteBestPracticeDescriptor = {
  toolId: "code.overwrite",
  bestPractice: "storage-owned-code-overwrite-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeOverwriteDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeOverwritePracticeProviderName | undefined): readonly CodeOverwriteProviderPractice[] {
  if (preferredProvider === undefined) return codeOverwriteProviderPractices;
  return [...codeOverwriteProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeOverwriteProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeOverwritePractice(dependencies: CodeOverwriteDependencies & { preferredProvider?: CodeOverwritePracticeProviderName } = {}): CodeOverwritePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host filesystem overwrite provider is available; dry-run remains available."], createProvider: () => undefined },
  };
}

function practiceAuditMetadata(selection: CodeOverwritePracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeCodeOverwrite(request: CodeOverwriteBestPracticeRequest = {}): ReturnType<typeof executeCodeOverwriteCore> {
  const selection = selectCodeOverwritePractice({ executor: request.executor, provider: request.writer ?? request.provider, preferredProvider: request.preferredProvider });
  return executeCodeOverwriteCore({ ...request, writer: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } });
}

const invocationContextSchema = { type: "object", additionalProperties: true, properties: { runtimeId: { type: "string" }, sessionId: { type: "string" }, invocationId: { type: "string" }, dryRun: { type: "boolean" }, workspaceRoot: { type: "string" }, guard: { type: "object", additionalProperties: true } } } as const;

export const codeOverwriteBaseToolDefinition = createCodeBaseToolDefinition<CodeOverwriteHandlerInput, CodeOverwriteOutput>({
  toolId: "code.overwrite",
  title: "Code Overwrite",
  description: "Apply a governed whole-file overwrite through runtime filesystem support. Always provide workspaceRoot as the absolute current workspace root for scope auditing, with targetPath relative to that root.",
  summary: "Use code.overwrite for complete file writes; pass workspaceRoot, targetPath, and content instead of shell redirection.",
  storageGroup: "edit",
  riskLevel: "risky",
  permissionHints: ["filesystem:write"],
  dependencies: codeOverwriteDependencyDeclarations,
  inputSchema: jsonSchema("code.overwrite.input", {
    type: "object",
    additionalProperties: true,
    required: ["workspaceRoot", "targetPath", "content"],
    properties: {
      workspaceRoot: {
        type: "string",
        description: "Absolute current workspace root used as the scope auditing anchor for edit safety.",
      },
      targetPath: {
        type: "string",
        description: "Workspace-relative file path to create or overwrite; do not use an absolute path.",
      },
      content: {
        type: "string",
        description: "Complete final file content.",
      },
      expectedExistingHash: { type: "string" },
      maxBytes: { type: "integer", minimum: 1 },
      dryRun: { type: "boolean" },
      context: invocationContextSchema,
    },
  }),
  outputSchema: jsonSchema("code.overwrite.output", { type: "object", additionalProperties: true }),
});

export const codeOverwriteHandler: BaseToolHandler<CodeOverwriteHandlerInput, CodeOverwriteOutput> = createCodeBaseCoreHandler(
  codeOverwriteBaseToolDefinition,
  async (request) => {
    const selection = selectCodeOverwritePractice({ ...request.input, executor: request.executor, provider: request.input.writer ?? request.input.provider });
    const inputContext = request.input.context ?? {};
    const context: CodeEditContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeCodeOverwriteCore({ ...request.input, writer: selection.provider, context });
  },
);

export type { CodeOverwriteResult };
export { codeOverwriteDescriptor, planCodeOverwrite };
