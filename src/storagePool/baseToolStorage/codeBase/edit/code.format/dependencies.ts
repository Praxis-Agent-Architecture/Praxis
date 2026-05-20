import type { BaseToolExecutorPort } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type { BaseToolDependencyDeclaration } from "../../../../../agentCore_executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import { applyLspTextEdits } from "../_shared/editCore.js";
import type { CodeFormatProvider } from "./core.js";

export type CodeFormatPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type CodeFormatDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: CodeFormatProvider;
};

export type CodeFormatProviderPractice = {
  providerName: CodeFormatPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  sideEffectPolicy: "runtime-governed";
  notes: readonly string[];
  createProvider(dependencies: CodeFormatDependencies): CodeFormatProvider | undefined;
};

export const codeFormatDependencyDeclarations: readonly BaseToolDependencyDeclaration[] = [
  {
    dependencyId: "runtime.execEngine.filesystem.readText/writeText",
    kind: "filesystem",
    required: true,
    description: "Runtime-owned text IO for applying approved formatting output.",
  },
  {
    dependencyId: "runtime.execEngine.lsp.formatDocumentPreview|formatRangePreview",
    kind: "runtime",
    required: true,
    description: "Runtime-owned formatter/LSP preview; storage core owns plan/output and final write.",
  },
  {
    dependencyId: "runtime.governancePlane.editApproval",
    kind: "permission",
    required: true,
    description: "dryRun:false must carry explicit guard/governance approval before any write.",
  },
];

export function createHostExecutorCodeFormatProvider(executor: BaseToolExecutorPort | undefined): CodeFormatProvider | undefined {
  const readText = executor?.filesystem?.readText;
  const writeText = executor?.filesystem?.writeText;
  const formatDocumentPreview = executor?.lsp?.formatDocumentPreview;
  const formatRangePreview = executor?.lsp?.formatRangePreview;
  if (readText === undefined || writeText === undefined || (formatDocumentPreview === undefined && formatRangePreview === undefined)) {
    return undefined;
  }
  return {
    async readText(request) {
      const result = await readText({ path: request.targetPath, encoding: request.encoding, maxBytes: request.maxBytes });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { content: result.output.content, truncated: result.output.truncated, encoding: request.encoding };
    },
    async writeText(request) {
      const result = await writeText({ path: request.targetPath, content: request.content, encoding: request.encoding });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return { bytesWritten: result.output.bytesWritten };
    },
    async formatText(request) {
      const result =
        request.range !== undefined && formatRangePreview !== undefined
          ? await formatRangePreview({
              target: {
                filePath: request.targetPath,
                languageId: request.languageHint,
                range: {
                  start: { line: request.range.startLine - 1, character: 0 },
                  end: { line: request.range.endLine, character: 0 },
                },
              },
              options: request.options,
              context: request.context,
            })
          : await formatDocumentPreview!({
              target: { filePath: request.targetPath, languageId: request.languageHint },
              options: request.options,
              context: request.context,
            });
      if (!result.ok) {
        throw new Error(result.error.message);
      }
      return {
        content: applyLspTextEdits(request.content, result.output.edits),
        editsCount: result.output.edits.length,
      };
    },
  };
}
