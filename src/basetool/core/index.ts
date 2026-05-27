import type {
  BaseToolDefinition,
  BaseToolInvokeRequest,
  BaseToolInvokeResult,
} from "../types.js";
import { invokeFileReadCore } from "./fileRead.js";
import { invokeFileSearchCore } from "./fileSearch.js";
import { invokePatchApplyCore } from "./patchApply.js";
import { invokePlanUpdateCore } from "./planUpdate.js";
import { invokeProcessKillCore } from "./processKill.js";
import { invokeProcessWaitCore } from "./processWait.js";
import { invokeShellRunCore } from "./shellRun.js";
import { invokeUserAskCore } from "./userAsk.js";
import { invokeWebFetchCore } from "./webFetch.js";
import { invokeWebSearchCore } from "./webSearch.js";
import { invokeSkillLoadCore } from "./skillLoad.js";
import { invokeContextLoadCore } from "./contextLoad.js";
import { invokeMcpUseCore } from "./mcpUse.js";
import { invokeMcpResourcesCore } from "./mcpResources.js";
import { invokeMediaViewImageCore } from "./mediaViewImage.js";
import { invokeToolDiscoverCore } from "./toolDiscover.js";
import { invokeToolDescribeCore } from "./toolDescribe.js";
import {
  invokeAgentInboxCore,
  invokeAgentInspectCore,
  invokeAgentKillCore,
  invokeAgentListCore,
  invokeAgentMessageCore,
  invokeAgentSpawnCore,
  invokeAgentStopCore,
  invokeAgentWaitCore,
} from "./agentTools.js";

export type BaseToolCoreInvoker = (
  definition: BaseToolDefinition,
  request: BaseToolInvokeRequest,
) => Promise<BaseToolInvokeResult> | BaseToolInvokeResult;

export const codingCoreToolIds = [
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "shell.run",
  "skill.load",
  "context.load",
  "mcp.use",
  "mcp.resources",
  "media.viewImage",
  "process.wait",
  "process.kill",
  "plan.update",
  "user.ask",
  "tool.discover",
  "tool.describe",
  "agent.spawn",
  "agent.message",
  "agent.inbox",
  "agent.list",
  "agent.inspect",
  "agent.wait",
  "agent.stop",
  "agent.kill",
] as const;

export type CodingCoreToolId = (typeof codingCoreToolIds)[number];

export const codingCoreInvokers: Readonly<Record<CodingCoreToolId, BaseToolCoreInvoker>> = {
  "file.read": invokeFileReadCore,
  "file.search": invokeFileSearchCore,
  "patch.apply": invokePatchApplyCore,
  "web.search": invokeWebSearchCore,
  "web.fetch": invokeWebFetchCore,
  "shell.run": invokeShellRunCore,
  "skill.load": invokeSkillLoadCore,
  "context.load": invokeContextLoadCore,
  "mcp.use": invokeMcpUseCore,
  "mcp.resources": invokeMcpResourcesCore,
  "process.wait": invokeProcessWaitCore,
  "process.kill": invokeProcessKillCore,
  "media.viewImage": invokeMediaViewImageCore,
  "plan.update": invokePlanUpdateCore,
  "user.ask": invokeUserAskCore,
  "tool.discover": invokeToolDiscoverCore,
  "tool.describe": invokeToolDescribeCore,
  "agent.spawn": invokeAgentSpawnCore,
  "agent.message": invokeAgentMessageCore,
  "agent.inbox": invokeAgentInboxCore,
  "agent.list": invokeAgentListCore,
  "agent.inspect": invokeAgentInspectCore,
  "agent.wait": invokeAgentWaitCore,
  "agent.stop": invokeAgentStopCore,
  "agent.kill": invokeAgentKillCore,
};

export function lookupBaseToolCoreInvoker(toolId: string): BaseToolCoreInvoker | undefined {
  return codingCoreInvokers[toolId as CodingCoreToolId];
}

export const baseToolCodingCoreDescriptor = {
  surface: "basetool.core",
  profileName: "agentCore",
  toolIds: codingCoreToolIds,
  directHostAccess: false,
  runtimePortRequired: true,
  inspiredBy: "opencode tool execute core, adapted to Praxis BaseToolExecutorPort",
} as const;

export * from "./results.js";
export * from "./validation.js";
export * from "./fileRead.js";
export * from "./fileSearch.js";
export * from "./patchApply.js";
export * from "./shellRun.js";
export * from "./webSearch.js";
export * from "./webFetch.js";
export * from "./skillLoad.js";
export * from "./contextLoad.js";
export * from "./mcpUse.js";
export * from "./mcpResources.js";
export * from "./processWait.js";
export * from "./processKill.js";
export * from "./mediaViewImage.js";
export * from "./planUpdate.js";
export * from "./userAsk.js";
export * from "./toolDiscover.js";
export * from "./toolDescribe.js";
export * from "./agentTools.js";
