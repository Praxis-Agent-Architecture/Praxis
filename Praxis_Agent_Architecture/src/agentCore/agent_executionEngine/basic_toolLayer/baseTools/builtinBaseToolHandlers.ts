import type { BaseToolHandler } from "./baseToolDefinition.js";

import { shellCommandExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.commandExecution/bestPractice.js";
import { shellInvocationExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.invocationExecution/bestPractice.js";
import { shellScriptExecutionHandler } from "../../../../storagePool/baseToolStorage/shellBase/shellExecution/shell.scriptExecution/bestPractice.js";
import { lspApplyCodeActionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_applyCodeAction/bestPractice.js";
import { lspAssistSignatureHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_assistSignature/bestPractice.js";
import { lspCompleteCodeHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_completeCode/bestPractice.js";
import { lspExplainSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_explainSymbol/bestPractice.js";
import { lspFormatDocumentHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatDocument/bestPractice.js";
import { lspFormatRangeHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_formatRange/bestPractice.js";
import { lspInspectDiagnosticsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectDiagnostics/bestPractice.js";
import { lspInspectSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_inspectSymbol/bestPractice.js";
import { lspLocateDefinitionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateDefinition/bestPractice.js";
import { lspLocateTypeDefinitionHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_locateTypeDefinition/bestPractice.js";
import { lspRenameSymbolHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_renameSymbol/bestPractice.js";
import { lspScanDocumentSymbolsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_scanDocumentSymbols/bestPractice.js";
import { lspSearchWorkspaceSymbolsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_searchWorkspaceSymbols/bestPractice.js";
import { lspSuggestCodeActionsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_suggestCodeActions/bestPractice.js";
import { lspTraceImplementationsHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceImplementations/bestPractice.js";
import { lspTraceReferencesHandler } from "../../../../storagePool/baseToolStorage/codeBase/lsp/code.lsp_traceReferences/bestPractice.js";

export const builtinBaseToolHandlers = [
  shellCommandExecutionHandler,
  shellInvocationExecutionHandler,
  shellScriptExecutionHandler,
  lspApplyCodeActionHandler,
  lspAssistSignatureHandler,
  lspCompleteCodeHandler,
  lspExplainSymbolHandler,
  lspFormatDocumentHandler,
  lspFormatRangeHandler,
  lspInspectDiagnosticsHandler,
  lspInspectSymbolHandler,
  lspLocateDefinitionHandler,
  lspLocateTypeDefinitionHandler,
  lspRenameSymbolHandler,
  lspScanDocumentSymbolsHandler,
  lspSearchWorkspaceSymbolsHandler,
  lspSuggestCodeActionsHandler,
  lspTraceImplementationsHandler,
  lspTraceReferencesHandler,
] as const satisfies readonly BaseToolHandler[];

export function builtinBaseToolHandlersById(): ReadonlyMap<string, BaseToolHandler> {
  return new Map(builtinBaseToolHandlers.map((handler) => [handler.definition.toolId, handler] as const));
}
