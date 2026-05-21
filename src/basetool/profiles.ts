import type { BaseToolProfile, BaseToolProfileName } from "./types.js";
import { semanticBaseToolCatalog } from "./catalog.js";

const coreMinimal = ["shell.run", "file.read", "file.search", "patch.apply", "web.search", "web.fetch", "plan.update", "user.ask"] as const;

const extensionTools = ["skill.load", "context.load", "mcp.use", "mcp.resources"] as const;

const nonRuntimeToolIds = semanticBaseToolCatalog
  .filter((definition) => definition.layer !== "runtime")
  .map((definition) => definition.toolId);

const runtimeToolIds = semanticBaseToolCatalog
  .filter((definition) => definition.layer === "runtime")
  .map((definition) => definition.toolId);

export const baseToolProfiles: Readonly<Record<BaseToolProfileName, BaseToolProfile>> = {
  minimalCoding: {
    name: "minimalCoding",
    description: "Single-agent coding core: shell, file read/search, patch, web, plan, and user ask.",
    visibleToolIds: coreMinimal,
    deferredToolIds: [],
    runtimeToolIds,
  },
  standardAgent: {
    name: "standardAgent",
    description: "Single-agent standard profile with skill, context, and MCP extensions.",
    visibleToolIds: [...coreMinimal, ...extensionTools],
    deferredToolIds: [],
    runtimeToolIds,
  },
  extendedAgent: {
    name: "extendedAgent",
    description: "All registered single-agent tools except runtime-only tools.",
    visibleToolIds: nonRuntimeToolIds,
    deferredToolIds: [],
    runtimeToolIds,
  },
  runtimeOnly: {
    name: "runtimeOnly",
    description: "Runtime management tools, never directly advertised as ordinary model tools.",
    visibleToolIds: [],
    deferredToolIds: [],
    runtimeToolIds,
  },
};

export function getBaseToolProfile(name: BaseToolProfileName): BaseToolProfile {
  return baseToolProfiles[name];
}
