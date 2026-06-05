/*
 * 文件定位：Agent 运行态实现层 / BaseTool 策略裁决器。
 * 核心目的：把 Praxis 五档 profile、工具事实、审批缓存和 side-agent 配置合成为一次工具调用的稳定策略包。
 * 边界：只做策略判定，不执行审批 UI、不运行 side agent、不执行工具。
 */

import type { BaseToolPolicyProfile } from "../runtimeAgentManifest.js";

export type BaseToolEffectiveRisk = "none" | "safe" | "risky" | "dangerous";
export type BaseToolHumanApprovalMode = "never" | "once" | "always";
export type BaseToolAgentReviewMode = "never" | "afterFirstHuman" | "always";
export type BaseToolAgentReviewStatus = "notRequired" | "required" | "skipped";
export type BaseToolPolicyAction = "allow" | "guarded" | "requiresApproval" | "deny";

export type BaseToolPolicyAdjudication = {
  kind: "runtime.execEngine.baseTool.policyAdjudication";
  toolId: string;
  profile: BaseToolPolicyProfile;
  risk: BaseToolEffectiveRisk;
  action: BaseToolPolicyAction;
  humanApprovalMode: BaseToolHumanApprovalMode;
  humanApprovalRequired: boolean;
  humanApprovalScopeKey: string;
  humanApprovalCacheHit: boolean;
  agentReviewMode: BaseToolAgentReviewMode;
  agentReviewStatus: BaseToolAgentReviewStatus;
  agentReviewRequired: boolean;
  sandboxRequired: boolean;
  sandboxStrength: "none" | "workspace-rollback" | "isolated";
  reason: string;
  publicSafe: true;
  events: readonly string[];
  metadata: Readonly<Record<string, unknown>>;
};

type ToolPolicyCell = {
  risk: BaseToolEffectiveRisk;
  human: BaseToolHumanApprovalMode;
  agent: BaseToolAgentReviewMode;
};

type FilesystemBoundaryAccess = "read" | "write";

function cell(
  risk: BaseToolEffectiveRisk,
  human: BaseToolHumanApprovalMode,
  agent: BaseToolAgentReviewMode,
): ToolPolicyCell {
  return { risk, human, agent };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function filesystemBoundaryAccess(args: Readonly<Record<string, unknown>> | undefined): FilesystemBoundaryAccess | undefined {
  const context = isRecord(args?.context) ? args.context : {};
  const audit = isRecord(context.auditMetadata) ? context.auditMetadata : {};
  if (audit.workspaceOutsideAllowedRoots !== true) return undefined;
  return audit.workspacePathAccess === "write" ? "write" : "read";
}

function outsideWorkspaceCell(profile: BaseToolPolicyProfile, access: FilesystemBoundaryAccess): ToolPolicyCell {
  if (profile === "bapr") return cell("none", "never", "never");
  if (profile === "yolo") return cell("safe", "never", "never");
  if (access === "read") {
    if (profile === "permissive") return cell("safe", "never", "never");
    if (profile === "standard" || profile === "restricted") return cell("risky", "once", "afterFirstHuman");
  }
  if (access === "write") {
    if (profile === "permissive") return cell("risky", "once", "afterFirstHuman");
    if (profile === "standard" || profile === "restricted") return cell("dangerous", "always", "always");
  }
  return defaultCells[profile] ?? defaultCells.custom;
}

const defaultCells: Record<BaseToolPolicyProfile, ToolPolicyCell> = {
  bapr: { risk: "none", human: "never", agent: "never" },
  yolo: { risk: "safe", human: "never", agent: "never" },
  permissive: { risk: "safe", human: "never", agent: "never" },
  standard: { risk: "safe", human: "never", agent: "never" },
  restricted: { risk: "safe", human: "never", agent: "never" },
  codingAgentFull: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  custom: { risk: "risky", human: "once", agent: "afterFirstHuman" },
};

const toolCells: Record<string, Partial<Record<BaseToolPolicyProfile, ToolPolicyCell>>> = {
  "shell.run": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "never" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "file.read": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "file.search": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "patch.apply": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "never" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "web.search": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "web.fetch": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "never" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "skill.load": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "never" },
  },
  "context.load": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "mcp.use": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "never" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "mcp.resources": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "never" },
  },
  "mcp.prompts": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "never" },
  },
  "mcp.completions": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "never" },
  },
  "process.kill": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "always" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "agent.spawn": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "agent.message": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "agent.inbox": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "agent.list": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "agent.inspect": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "risky", human: "once", agent: "afterFirstHuman" },
  },
  "agent.wait": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "safe", human: "never", agent: "never" },
    restricted: { risk: "safe", human: "never", agent: "never" },
  },
  "agent.stop": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "always" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "agent.kill": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    standard: { risk: "dangerous", human: "always", agent: "always" },
    restricted: { risk: "dangerous", human: "always", agent: "always" },
  },
  "tool.discover": {
    bapr: { risk: "none", human: "never", agent: "never" },
    yolo: { risk: "safe", human: "never", agent: "never" },
    permissive: { risk: "safe", human: "never", agent: "never" },
    standard: { risk: "risky", human: "once", agent: "afterFirstHuman" },
    restricted: { risk: "risky", human: "once", agent: "never" },
  },
};

const alwaysSafeTools = new Set(["plan.update", "user.ask", "process.wait", "tool.describe"]);

export function classifyShellCommandRisk(command: string | undefined): BaseToolEffectiveRisk {
  const source = command?.trim().toLowerCase() ?? "";
  if (source.length === 0) return "risky";
  if (/\b(sudo|su|rm|rmdir|chmod|chown|dd|mkfs|mount|umount|systemctl|service|kill|pkill|shutdown|reboot)\b/u.test(source)) {
    return "dangerous";
  }
  if (/(\|\s*(sh|bash|zsh)\b|>\s*[^&]|\btee\b|\bcurl\b.*\|\s*(sh|bash)|\bwget\b.*\|\s*(sh|bash))/u.test(source)) {
    return "dangerous";
  }
  if (/\b(npm|pnpm|yarn|bun|pip|uv|cargo|go)\s+(install|add|remove|update|upgrade)\b/u.test(source)) return "risky";
  if (/\b(git\s+(add|commit|merge|rebase|push|reset|checkout|restore|clean)|touch|mkdir|cp|mv)\b/u.test(source)) return "risky";
  if (/^(pwd|ls|cat|head|tail|wc|rg|grep|find|sed\s+-n|git\s+(status|diff|log|show|branch|rev-parse|ls-files)|npm\s+(test|run\s+\S+)|pnpm\s+(test|run\s+\S+))\b/u.test(source)) {
    return "safe";
  }
  return "risky";
}

export function policyCellForTool(input: {
  toolId: string;
  profile: BaseToolPolicyProfile;
  args?: Readonly<Record<string, unknown>>;
}): ToolPolicyCell {
  const boundaryAccess = filesystemBoundaryAccess(input.args);
  if (boundaryAccess !== undefined) return outsideWorkspaceCell(input.profile, boundaryAccess);
  if (alwaysSafeTools.has(input.toolId)) return defaultCells[input.profile] ?? defaultCells.custom;
  const explicit = toolCells[input.toolId]?.[input.profile];
  const base = explicit ?? defaultCells[input.profile] ?? defaultCells.custom;
  if (input.toolId !== "shell.run") return base;
  const commandRisk = classifyShellCommandRisk(typeof input.args?.command === "string" ? input.args.command : undefined);
  if (input.profile === "bapr" || input.profile === "yolo") return base;
  if (commandRisk === "safe" && base.risk !== "dangerous") return { risk: "safe", human: "never", agent: "never" };
  if (commandRisk === "dangerous") return { ...base, risk: "dangerous" };
  return { ...base, risk: base.risk === "dangerous" ? "dangerous" : "risky" };
}

export function adjudicateBaseToolPolicy(input: {
  toolId: string;
  profile: BaseToolPolicyProfile;
  approvalScopeKey: string;
  humanApprovalCacheHit?: boolean;
  hasAgentReviewer?: boolean;
  args?: Readonly<Record<string, unknown>>;
}): BaseToolPolicyAdjudication {
  const cell = policyCellForTool(input);
  const sandboxStrength = input.profile === "bapr"
    ? "none"
    : input.profile === "yolo"
      ? "workspace-rollback"
      : "isolated";
  const humanApprovalRequired = cell.human === "always" || (cell.human === "once" && input.humanApprovalCacheHit !== true);
  const shouldAgentReview = cell.agent === "always" || (cell.agent === "afterFirstHuman" && input.humanApprovalCacheHit === true);
  const agentReviewStatus: BaseToolAgentReviewStatus = shouldAgentReview
    ? input.hasAgentReviewer === true ? "required" : "skipped"
    : "notRequired";
  const agentReviewRequired = agentReviewStatus === "required";
  const action: BaseToolPolicyAction = humanApprovalRequired
    ? "requiresApproval"
    : sandboxStrength === "none"
      ? "allow"
      : "guarded";

  return {
    kind: "runtime.execEngine.baseTool.policyAdjudication",
    toolId: input.toolId,
    profile: input.profile,
    risk: cell.risk,
    action,
    humanApprovalMode: cell.human,
    humanApprovalRequired,
    humanApprovalScopeKey: input.approvalScopeKey,
    humanApprovalCacheHit: input.humanApprovalCacheHit === true,
    agentReviewMode: cell.agent,
    agentReviewStatus,
    agentReviewRequired,
    sandboxRequired: sandboxStrength !== "none",
    sandboxStrength,
    reason: humanApprovalRequired
      ? `BaseTool ${input.toolId} requires human approval for ${input.profile}`
      : agentReviewStatus === "skipped"
        ? `BaseTool ${input.toolId} skipped agent review because no reviewer is configured`
        : `BaseTool ${input.toolId} is ${action} under ${input.profile}`,
    publicSafe: true,
    events: [
      `runtime.execEngine.baseTool.policy.${action}`,
      ...(agentReviewStatus === "skipped" ? ["runtime.execEngine.baseTool.policy.agentReviewSkipped"] : []),
    ],
    metadata: {
      risk: cell.risk,
      humanApprovalMode: cell.human,
      agentReviewMode: cell.agent,
      sandboxStrength,
    },
  };
}

export const baseToolPolicyAdjudicatorDescriptor = {
  surface: "runtime.execEngine.baseToolPolicyAdjudicator",
  profiles: ["bapr", "yolo", "permissive", "standard", "restricted"],
  publicSafe: true,
} as const;
