/*
 * 文件定位：storagePool / baseToolStorage / code.lsp_locateDefinition 共享依赖。
 * 核心目的：把 LSP 定义定位的共用 host 依赖和 provider practice 契约集中在一起。
 */

import type { BaseToolDependencyDeclaration } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolDefinition.js";
import type { BaseToolExecutorPort } from "../../../../../executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import type {
  LspLocateDefinitionProvider,
  LspLocation,
  LspTextDocumentPosition,
  LspToolContext,
} from "./core.js";
import { locateDefinitionWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type { LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspLocateDefinitionPracticeProviderName = "anthropic" | "openai" | "deepmind" | "praxis-native";

export type LspLocateDefinitionProviderPractice = {
  providerName: LspLocateDefinitionPracticeProviderName;
  source: {
    kind: "cli" | "agent-sdk" | "api-sdk" | "praxis-native";
    label: string;
    path?: string;
  };
  directCliSupport: boolean;
  notes: readonly string[];
  createProvider(dependencies: LspLocateDefinitionDependencies): LspLocateDefinitionProvider | undefined;
};

export type LspLocateDefinitionDependencies = {
  executor?: BaseToolExecutorPort;
  provider?: LspLocateDefinitionProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspLocateDefinitionDependencyDeclarations = [
  {
    dependencyId: "host.executor.lsp.locateDefinition",
    kind: "service",
    required: false,
    description: "Optional host-provided LSP executor capable of issuing textDocument/definition requests.",
  },
  {
    dependencyId: "workspace.read",
    kind: "permission",
    required: true,
    description: "Read access to the target workspace file so the LSP server can resolve the symbol context.",
  },
  {
    dependencyId: "lsp.server.forTargetLanguage",
    kind: "runtime",
    required: true,
    description: "A language server configured for the target file language or extension.",
  },
  {
    dependencyId: "node.child_process.stdioJsonRpc",
    kind: "runtime",
    required: true,
    description: "Node.js stdio process runtime used by the built-in Praxis LSP runtime.",
  },
] satisfies readonly BaseToolDependencyDeclaration[];

export function createHostExecutorLocateDefinitionProvider(
  executor: BaseToolExecutorPort | undefined,
): LspLocateDefinitionProvider | undefined {
  const locateDefinition = executor?.lsp?.locateDefinition;
  if (locateDefinition === undefined) {
    return undefined;
  }

  return async (target: LspTextDocumentPosition, context: LspToolContext): Promise<readonly LspLocation[]> => {
    const result = await locateDefinition({
      target,
      context: {
        invocationId: context.invocationId,
        workspaceRoot: context.workspaceRoot,
        auditMetadata: context.auditMetadata,
      },
    });

    if (!result.ok) {
      throw new Error(result.error.message);
    }

    return result.output.locations.map((location) => ({
      ...location,
      source: "provider" as const,
    }));
  };
}

export function createNativeLspRuntimeLocateDefinitionProvider(
  runtime: LspLocateDefinitionRuntimeOptions | undefined = {},
): LspLocateDefinitionProvider {
  return async (target: LspTextDocumentPosition, context: LspToolContext): Promise<readonly LspLocation[]> =>
    locateDefinitionWithLspRuntime(target, {
      ...runtime,
      workspaceRoot: runtime.workspaceRoot ?? context.workspaceRoot,
    });
}
