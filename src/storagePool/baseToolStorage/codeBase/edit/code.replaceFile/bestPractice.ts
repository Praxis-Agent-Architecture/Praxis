import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolHandler } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { buildCodeBasePracticeAuditMetadata, createCodeBaseCoreHandler, createCodeBaseToolDefinition, injectRuntimeInvocationMetadata, jsonSchema } from "../../_shared/baseToolAdapter.js";
import type { CodeEditContext } from "../_shared/editCore.js";
import { anthropicCodeReplaceFilePractice } from "./anthropic.js";
import { deepmindCodeReplaceFilePractice } from "./deepmind.js";
import { codeReplaceFileDependencyDeclarations, type CodeReplaceFileDependencies, type CodeReplaceFilePracticeProviderName, type CodeReplaceFileProviderPractice } from "./dependencies.js";
import { openaiCodeReplaceFilePractice } from "./openai.js";
import {
  codeReplaceFileDescriptor,
  executeCodeReplaceFile as executeCodeReplaceFileCore,
  planCodeReplaceFile,
  type CodeReplaceFileOutput,
  type CodeReplaceFileProvider,
  type CodeReplaceFileRequest,
  type CodeReplaceFileResult,
} from "./core.js";

export * from "./core.js";

export type CodeReplaceFileBestPracticeRequest = CodeReplaceFileRequest & { executor?: BaseToolExecutorPort; preferredProvider?: CodeReplaceFilePracticeProviderName };
export type CodeReplaceFileHandlerInput = Omit<CodeReplaceFileBestPracticeRequest, "executor">;
export type CodeReplaceFilePracticeSelection = { providerName: CodeReplaceFilePracticeProviderName; practice: CodeReplaceFileProviderPractice; provider?: CodeReplaceFileProvider };

export const codeReplaceFileProviderPractices = [anthropicCodeReplaceFilePractice, openaiCodeReplaceFilePractice, deepmindCodeReplaceFilePractice] as const;
export const codeReplaceFileBestPracticeDescriptor = {
  toolId: "code.replaceFile",
  bestPractice: "storage-owned-code-replace-file-with-runtime-filesystem-support",
  sourcePriority: ["cli", "agent-sdk", "api-sdk", "praxis-native"],
  providerOrder: ["anthropic", "openai", "deepmind"],
  dependencies: codeReplaceFileDependencyDeclarations,
} as const;

function orderedPractices(preferredProvider: CodeReplaceFilePracticeProviderName | undefined): readonly CodeReplaceFileProviderPractice[] {
  if (preferredProvider === undefined) return codeReplaceFileProviderPractices;
  return [...codeReplaceFileProviderPractices.filter((practice) => practice.providerName === preferredProvider), ...codeReplaceFileProviderPractices.filter((practice) => practice.providerName !== preferredProvider)];
}

export function selectCodeReplaceFilePractice(dependencies: CodeReplaceFileDependencies & { preferredProvider?: CodeReplaceFilePracticeProviderName } = {}): CodeReplaceFilePracticeSelection {
  for (const practice of orderedPractices(dependencies.preferredProvider)) {
    const provider = practice.createProvider(dependencies);
    if (provider !== undefined) return { providerName: practice.providerName, practice, provider };
  }
  return {
    providerName: "praxis-native",
    practice: { providerName: "praxis-native", source: { kind: "praxis-native", label: "Praxis dry-run fallback" }, directCliSupport: false, sideEffectPolicy: "runtime-governed", notes: ["No injected or host filesystem replacement provider is available; dry-run remains available."], createProvider: () => undefined },
  };
}

function practiceAuditMetadata(selection: CodeReplaceFilePracticeSelection): Readonly<Record<string, unknown>> {
  return buildCodeBasePracticeAuditMetadata({ providerName: selection.providerName, sourceLabel: selection.practice.source.label, sourceKind: selection.practice.source.kind, sourcePath: selection.practice.source.path, directCliSupport: selection.practice.directCliSupport, sideEffectPolicy: selection.practice.sideEffectPolicy, notes: selection.practice.notes });
}

export async function executeCodeReplaceFile(request: CodeReplaceFileBestPracticeRequest = {}): ReturnType<typeof executeCodeReplaceFileCore> {
  const selection = selectCodeReplaceFilePractice({ executor: request.executor, provider: request.writer ?? request.provider, preferredProvider: request.preferredProvider });
  return executeCodeReplaceFileCore({ ...request, writer: selection.provider, context: { ...request.context, auditMetadata: { ...(request.context?.auditMetadata ?? {}), ...practiceAuditMetadata(selection) } } });
}

const invocationContextSchema = { type: "object", additionalProperties: true, properties: { runtimeId: { type: "string" }, sessionId: { type: "string" }, invocationId: { type: "string" }, dryRun: { type: "boolean" }, workspaceRoot: { type: "string" }, guard: { type: "object", additionalProperties: true } } } as const;

export const codeReplaceFileBaseToolDefinition = createCodeBaseToolDefinition<CodeReplaceFileHandlerInput, CodeReplaceFileOutput>({
  toolId: "code.replaceFile",
  title: "Code Replace File",
  description: "Apply a governed whole-file replacement through runtime filesystem support.",
  summary: "Use code.replaceFile for explicit file replacement with optional expected hash checks.",
  storageGroup: "edit",
  riskLevel: "risky",
  permissionHints: ["filesystem:read", "filesystem:write"],
  dependencies: codeReplaceFileDependencyDeclarations,
  inputSchema: jsonSchema("code.replaceFile.input", { type: "object", additionalProperties: true, properties: { targetPath: { type: "string" }, newContent: { type: "string" }, expectedCurrentHash: { type: "string" }, dryRun: { type: "boolean" }, context: invocationContextSchema } }),
  outputSchema: jsonSchema("code.replaceFile.output", { type: "object", additionalProperties: true }),
});

export const codeReplaceFileHandler: BaseToolHandler<CodeReplaceFileHandlerInput, CodeReplaceFileOutput> = createCodeBaseCoreHandler(
  codeReplaceFileBaseToolDefinition,
  async (request) => {
    const selection = selectCodeReplaceFilePractice({ ...request.input, executor: request.executor, provider: request.input.writer ?? request.input.provider });
    const inputContext = request.input.context ?? {};
    const context: CodeEditContext = { ...inputContext, runtimeId: inputContext.runtimeId ?? request.runtimeId, sessionId: inputContext.sessionId ?? request.sessionId, invocationId: inputContext.invocationId ?? request.toolCallId, auditMetadata: injectRuntimeInvocationMetadata({ ...practiceAuditMetadata(selection), ...(request.metadata ?? {}) }, inputContext.auditMetadata, request) };
    return executeCodeReplaceFileCore({ ...request.input, writer: selection.provider, context });
  },
);

export type { CodeReplaceFileResult };
export { codeReplaceFileDescriptor, planCodeReplaceFile };
