/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具集合 / 代码基础工具 / LSP 语义工具。
 * 核心目的：提供 代码基础工具 / LSP 语义工具 中的“重命名符号”基础能力原语。
 * 能力要求1：需要定义该能力的输入、输出、错误、权限需求和可观测事件。
 * 能力要求2：这些基础工具是 Agent 成立的底层能力，不是 TAP 的最终高级工具库。
 * 能力要求3：后续 TAP 可以基于这些原语构建更强的工具编排、审批、替换和专业能力库。
 * 边界：保留 Agent 基础工具原语，不替代 TAP 的高级工具系统。
 * 对接：需要被 runtime.execEngine 拉起，并和 mainLoop、stateEngine、事件暴露、工具调用策略接通。
 * 实现提示：先补稳定类型契约、最小可测行为和清晰错误边界，再接入真实执行逻辑。
 */

import {
  createLspToolFailure,
  ensureLspToolScope,
  normalizeLspTextDocumentPosition,
  type LspRange,
  type LspTextDocumentPosition,
  type LspToolAuditEvent,
  type LspToolContext,
  type LspToolResult,
} from "./code.lsp_locateDefinition.js";

export type LspRenameWorkspaceEdit = {
  changes: readonly {
    filePath: string;
    range: LspRange;
    newText: string;
  }[];
  source: "provider" | "dry-run";
};

export type LspRenameSymbolOutput = {
  kind: "agentCore.basicTool.lsp.renameSymbol";
  target: LspTextDocumentPosition;
  newName: string;
  workspaceEdit: LspRenameWorkspaceEdit;
  dryRun: boolean;
  providerCalled: boolean;
  appliedChanges: false;
  permissionsRequired: readonly ["workspace:read", "lsp:read", "workspace:edit", "lsp:rename"];
  unsafeSideEffects: false;
};

export type LspRenameSymbolProvider = (
  target: LspTextDocumentPosition,
  newName: string,
  context: LspToolContext,
) => LspRenameWorkspaceEdit | Promise<LspRenameWorkspaceEdit>;

export type LspRenameSymbolRequest = {
  target?: Partial<LspTextDocumentPosition>;
  newName?: string;
  applyChanges?: boolean;
  context?: LspToolContext;
  provider?: LspRenameSymbolProvider;
};

export const lspRenameSymbolDescriptor = {
  toolId: "code.lsp_renameSymbol",
  capability: "rename-symbol",
  route: "agent_executionEngine.basic_toolLayer.baseTools.codeBase.lsp",
  permissionsRequired: ["workspace:read", "lsp:read", "workspace:edit", "lsp:rename"],
  defaultDryRun: true,
  appliesChanges: false,
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
  return context?.invocationId?.trim() || `${lspRenameSymbolDescriptor.toolId}:dry-run`;
}

function auditEvent(
  type: string,
  context: LspToolContext | undefined,
  targetFilePath?: string,
  metadata?: Readonly<Record<string, unknown>>,
): LspToolAuditEvent {
  return {
    type,
    toolId: lspRenameSymbolDescriptor.toolId,
    invocationId: invocationId(context),
    dryRun: dryRunEnabled(context),
    targetFilePath,
    metadata: {
      ...(context?.auditMetadata ?? {}),
      ...(metadata ?? {}),
    },
  };
}

function dryRunWorkspaceEdit(target: LspTextDocumentPosition, newName: string): LspRenameWorkspaceEdit {
  return {
    source: "dry-run",
    changes: [
      {
        filePath: target.filePath,
        range: {
          start: { line: target.line, character: target.character },
          end: { line: target.line, character: target.character },
        },
        newText: newName,
      },
    ],
  };
}

export async function renameLspSymbol(
  request: LspRenameSymbolRequest = {},
): Promise<LspToolResult<LspRenameSymbolOutput>> {
  const toolId = lspRenameSymbolDescriptor.toolId;
  const target = normalizeLspTextDocumentPosition(request.target);

  if ("code" in target) {
    return createLspToolFailure(toolId, target.code, target.message, target.boundary, request.context, request.target?.filePath);
  }

  const newName = request.newName?.trim();
  if (isBlank(newName)) {
    return createLspToolFailure(
      toolId,
      "MISSING_NEW_NAME",
      "rename symbol requires a non-empty newName",
      "input",
      request.context,
      target.filePath,
    );
  }

  const scopeFailure = ensureLspToolScope(toolId, target, request.context);
  if (scopeFailure !== undefined) {
    return scopeFailure;
  }

  if (request.applyChanges === true) {
    return createLspToolFailure(
      toolId,
      "DANGEROUS_SIDE_EFFECT_BLOCKED",
      "rename symbol only returns an auditable workspace edit plan in the first implementation",
      "governance",
      request.context,
      target.filePath,
    );
  }

  const dryRun = dryRunEnabled(request.context);
  if (dryRun) {
    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.renameSymbol",
        target,
        newName,
        workspaceEdit: dryRunWorkspaceEdit(target, newName),
        dryRun: true,
        providerCalled: false,
        appliedChanges: false,
        permissionsRequired: lspRenameSymbolDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [auditEvent("agentCore.basicTool.lsp.renameSymbol.dryRun", request.context, target.filePath)],
      events: ["basicTool.lsp.renameSymbol.dryRun"],
    };
  }

  if (request.provider === undefined) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_UNAVAILABLE",
      "rename symbol requires an injected LSP provider when dryRun is disabled",
      "provider",
      request.context,
      target.filePath,
    );
  }

  try {
    const workspaceEdit = await request.provider(target, newName, request.context ?? {});

    return {
      ok: true,
      toolId,
      output: {
        kind: "agentCore.basicTool.lsp.renameSymbol",
        target,
        newName,
        workspaceEdit: {
          ...workspaceEdit,
          changes: Object.freeze([...workspaceEdit.changes]),
          source: "provider",
        },
        dryRun: false,
        providerCalled: true,
        appliedChanges: false,
        permissionsRequired: lspRenameSymbolDescriptor.permissionsRequired,
        unsafeSideEffects: false,
      },
      audit: [
        auditEvent("agentCore.basicTool.lsp.renameSymbol.provider", request.context, target.filePath, {
          changeCount: workspaceEdit.changes.length,
          appliedChanges: false,
        }),
      ],
      events: ["basicTool.lsp.renameSymbol.providerCalled"],
    };
  } catch (error) {
    return createLspToolFailure(
      toolId,
      "PROVIDER_REJECTED",
      error instanceof Error ? error.message : "rename symbol provider rejected the invocation",
      "provider",
      request.context,
      target.filePath,
    );
  }
}
