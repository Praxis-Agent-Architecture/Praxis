/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“搜索工作区符号”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspToolFailure,
  type LspLocation,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "../code.lsp_locateDefinition/core.js";
import { searchWorkspaceSymbolsWithLspRuntime, type LspLocateDefinitionRuntimeOptions } from "../_shared/runtime.js";

export type LspWorkspaceSymbol = {
  name: string;
  kind: string;
  location?: LspLocation;
  containerName?: string;
  detail?: string;
  source: "provider" | "dry-run";
};

export type LspWorkspaceSymbolProviderResult = Omit<LspWorkspaceSymbol, "source"> & {
  source?: LspWorkspaceSymbol["source"];
};

export type LspSearchWorkspaceSymbolsOutput = {
  kind: "agentCore.basicTool.lsp.searchWorkspaceSymbols";
  query: string;
  symbols: readonly LspWorkspaceSymbol[];
  limit: number;
  dryRun: boolean;
  providerCalled: boolean;
  permissionsRequired: readonly ["workspace:read", "lsp:read"];
  unsafeSideEffects: false;
};

export type LspSearchWorkspaceSymbolsProvider = (
  query: string,
  context: LspToolContext,
  limit: number,
) => readonly LspWorkspaceSymbolProviderResult[] | Promise<readonly LspWorkspaceSymbolProviderResult[]>;

export type LspSearchWorkspaceSymbolsRequest = {
  query?: string;
  limit?: number;
  context?: LspToolContext;
  provider?: LspSearchWorkspaceSymbolsProvider;
  runtime?: LspLocateDefinitionRuntimeOptions;
};

export const lspSearchWorkspaceSymbolsDescriptor = {
  toolId: "code.lsp_searchWorkspaceSymbols",
  capability: "search-workspace-symbols",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read"],
  defaultDryRun: true,
  unsafeSideEffects: false,
  tapOwnsApproval: true,
} as const;

function isBlank(value: string | undefined): value is undefined {
  return typeof value !== "string" || value.trim().length === 0;
}

function dryRunEnabled(context: LspToolContext | undefined): boolean {
  return context?.dryRun !== false;
}

function invocationId(context: LspToolContext | undefined): string {
  return context?.invocationId?.trim() || `${lspSearchWorkspaceSymbolsDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspSearchWorkspaceSymbolsDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) {
    return 50;
  }

  return Math.min(limit, 200);
}

function guardWorkspaceSearch(context: LspToolContext | undefined): LspToolResult<LspSearchWorkspaceSymbolsOutput> | undefined {
  if (context?.guard?.allowed === false) {
    return createLspToolFailure(
      lspSearchWorkspaceSymbolsDescriptor.toolId,
      "GOVERNANCE_REJECTED",
      context.guard.reason ?? "workspace symbol search was rejected by governance guard",
      "governance",
      context,
    );
  }

  return undefined;
}

export async function searchLspWorkspaceSymbols(
  request: LspSearchWorkspaceSymbolsRequest = {},
): Promise<LspToolResult<LspSearchWorkspaceSymbolsOutput>> {
  const toolId = lspSearchWorkspaceSymbolsDescriptor.toolId;
  const query = request.query?.trim();

  if (isBlank(query)) {
    return createLspToolFailure(
      toolId,
      "MISSING_SYMBOL_NAME",
      "search workspace symbols requires a non-empty query",
      "input",
      request.context,
    );
  }

  const guardFailure = guardWorkspaceSearch(request.context);
  if (guardFailure !== undefined) {
    return guardFailure;
  }

  const limit = normalizeLimit(request.limit);
  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.searchWorkspaceSymbols",
        query,
        symbols: Object.freeze([]),
        limit,
        dryRun: true,
        providerCalled: false,
        permissionsRequired: lspSearchWorkspaceSymbolsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.lsp.searchWorkspaceSymbols.dryRun", request.context, { query, limit })],
      events: ["basicTool.lsp.searchWorkspaceSymbols.dryRun"],
    };
  }

  try {
    const symbols =
      request.provider !== undefined
        ? await request.provider(query, request.context ?? {}, limit)
        : await searchWorkspaceSymbolsWithLspRuntime(query, {
            ...request.runtime,
            workspaceRoot: request.runtime?.workspaceRoot ?? request.context?.workspaceRoot,
          });

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.searchWorkspaceSymbols",
        query,
        symbols: Object.freeze([...symbols].slice(0, limit).map((symbol) => ({ ...symbol, source: "provider" as const }))),
        limit,
        dryRun: false,
        providerCalled: true,
        permissionsRequired: lspSearchWorkspaceSymbolsDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.searchWorkspaceSymbols.provider", request.context, {
          query,
          limit,
          symbolCount: symbols.length,
        }),
      ],
      events: ["basicTool.lsp.searchWorkspaceSymbols.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      "code.lsp_searchWorkspaceSymbols provider rejected the invocation",
      "provider",
      request.context,
    );
  }
}
