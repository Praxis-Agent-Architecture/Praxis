/*
 * Legacy compatibility shim.
 * Current semantic basetool definitions live in src/basetool.
 */

export type {
  BaseToolDefinition,
  BaseToolDependencyDeclaration,
  BaseToolFamily,
  BaseToolHandler,
  BaseToolInputSchema,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
  BaseToolPolicyRisk,
  BaseToolRiskLevel,
} from "../../../basetool/types.js";
