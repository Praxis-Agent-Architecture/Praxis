/*
 * 文件定位：raxode-cli / MCP readiness summary。
 * 核心目的：把 Raxode MCP 配置转成 public-safe 的 runtime readiness 事实，不泄露 command/env/header。
 */

import type { CreateApplicationProjectRuntimeOptions } from "@praxis-ai/praxis/application-layer";
import type { RaxodeMcpConfig } from "../../frontend/tui/config/raxode-config.js";

export type RaxodeMcpReadinessSummary = {
  kind: "raxode.mcpReadinessSummary";
  schemaVersion: "raxode.mcpReadinessSummary.v1";
  configuredServerCount: number;
  enabledServerCount: number;
  disabledServerCount: number;
  enabledMcpPlusServerCount: number;
  enabledNativeServerCount: number;
  configuredServerIds: readonly string[];
  enabledServerIds: readonly string[];
  enabledMcpPlusServerIds: readonly string[];
  enabledNativeServerIds: readonly string[];
  recommendedMode: "mcp-plus";
  nativeCompatible: true;
  publicSafe: true;
  profileIdentity: "serverId+project";
  runtimeOverlayIdentity: "serverId+session";
  schemaRefreshBoundary: "session-checkpoint";
  projectId?: string;
  reprofileConsecutiveIndexedCalls?: number;
};

export function createRaxodeMcpReadinessSummary(config?: RaxodeMcpConfig): RaxodeMcpReadinessSummary {
  const servers = config?.servers ?? [];
  const enabled = servers.filter((server) => server.enabled);
  const mcpPlus = enabled.filter((server) => server.mode === "mcp-plus");
  const native = enabled.filter((server) => server.mode === "native");
  return {
    kind: "raxode.mcpReadinessSummary",
    schemaVersion: "raxode.mcpReadinessSummary.v1",
    configuredServerCount: servers.length,
    enabledServerCount: enabled.length,
    disabledServerCount: servers.length - enabled.length,
    enabledMcpPlusServerCount: mcpPlus.length,
    enabledNativeServerCount: native.length,
    configuredServerIds: servers.map((server) => server.serverId),
    enabledServerIds: enabled.map((server) => server.serverId),
    enabledMcpPlusServerIds: mcpPlus.map((server) => server.serverId),
    enabledNativeServerIds: native.map((server) => server.serverId),
    recommendedMode: "mcp-plus",
    nativeCompatible: true,
    publicSafe: true,
    profileIdentity: "serverId+project",
    runtimeOverlayIdentity: "serverId+session",
    schemaRefreshBoundary: "session-checkpoint",
    projectId: config?.projectId,
    reprofileConsecutiveIndexedCalls: config?.reprofileConsecutiveIndexedCalls,
  };
}

export function createRaxodeMcpReadinessSummaryFromRuntimeOptions(input: {
  mcpServers?: CreateApplicationProjectRuntimeOptions["mcpServers"];
  mcpPlus?: CreateApplicationProjectRuntimeOptions["mcpPlus"];
}): RaxodeMcpReadinessSummary {
  const servers = input.mcpServers ?? [];
  const mcpPlus = servers.filter((server) => server.mode === "mcp-plus");
  const native = servers.filter((server) => server.mode === "native");
  return {
    kind: "raxode.mcpReadinessSummary",
    schemaVersion: "raxode.mcpReadinessSummary.v1",
    configuredServerCount: servers.length,
    enabledServerCount: servers.length,
    disabledServerCount: 0,
    enabledMcpPlusServerCount: mcpPlus.length,
    enabledNativeServerCount: native.length,
    configuredServerIds: servers.map((server) => server.serverId),
    enabledServerIds: servers.map((server) => server.serverId),
    enabledMcpPlusServerIds: mcpPlus.map((server) => server.serverId),
    enabledNativeServerIds: native.map((server) => server.serverId),
    recommendedMode: "mcp-plus",
    nativeCompatible: true,
    publicSafe: true,
    profileIdentity: "serverId+project",
    runtimeOverlayIdentity: "serverId+session",
    schemaRefreshBoundary: "session-checkpoint",
    projectId: input.mcpPlus?.projectId,
    reprofileConsecutiveIndexedCalls: input.mcpPlus?.reprofileConsecutiveIndexedCalls,
  };
}
