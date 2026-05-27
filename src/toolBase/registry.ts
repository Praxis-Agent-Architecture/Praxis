import { TOOL_BASE_CATALOG } from "./catalog.js";
import { TOOL_BASE_PROFILES } from "./profiles.js";
import type {
  ToolBaseDefinition,
  ToolBaseId,
  ToolBaseProfile,
  ToolBaseProfileName,
  ToolBaseProviderCapability,
  ToolBaseToolSet,
  ToolBaseVisibility,
} from "./types.js";

export type CreateToolBaseRegistryOptions = {
  catalog?: readonly ToolBaseDefinition[];
  profiles?: readonly ToolBaseProfile[];
};

export type ToolBaseRegistry = {
  listDefinitions(): readonly ToolBaseDefinition[];
  listProfiles(): readonly ToolBaseProfile[];
  getDefinition(toolId: ToolBaseId): ToolBaseDefinition | undefined;
  getProfile(profile: ToolBaseProfileName): ToolBaseProfile | undefined;
  resolveToolSet(profile: ToolBaseProfileName, provider?: ToolBaseProviderCapability): ToolBaseToolSet;
};

export function createToolBaseRegistry(
  options: CreateToolBaseRegistryOptions = {},
): ToolBaseRegistry {
  const catalog = options.catalog ?? TOOL_BASE_CATALOG;
  const profiles = options.profiles ?? TOOL_BASE_PROFILES;
  const definitionById = new Map<ToolBaseId, ToolBaseDefinition>(
    catalog.map((definition) => [definition.id, definition]),
  );
  const profileByName = new Map<ToolBaseProfileName, ToolBaseProfile>(
    profiles.map((profile) => [profile.name, profile]),
  );

  return {
    listDefinitions: () => catalog,
    listProfiles: () => profiles,
    getDefinition: (toolId) => definitionById.get(toolId),
    getProfile: (profile) => profileByName.get(profile),
    resolveToolSet: (profileName, provider) => {
      const profile = profileByName.get(profileName) ?? profileByName.get("standardAgent");
      if (profile === undefined) {
        return emptyToolSet(profileName);
      }

      return resolveToolSetFromProfile(profile, definitionById, provider);
    },
  };
}

function resolveToolSetFromProfile(
  profile: ToolBaseProfile,
  definitionById: ReadonlyMap<ToolBaseId, ToolBaseDefinition>,
  provider: ToolBaseProviderCapability | undefined,
): ToolBaseToolSet {
  const deferredIds = new Set(profile.deferredToolIds ?? []);
  const hiddenIds = new Set(profile.hiddenToolIds ?? []);
  const maxVisibleTools = provider?.maxVisibleTools;
  const visible: ToolBaseDefinition[] = [];
  const deferred: ToolBaseDefinition[] = [];
  const runtimeOnly: ToolBaseDefinition[] = [];
  const disabled: ToolBaseDefinition[] = [];

  for (const toolId of profile.toolIds) {
    const definition = definitionById.get(toolId);
    if (definition === undefined) {
      disabled.push(missingToolDefinition(toolId));
      continue;
    }

    const visibility = resolveVisibility(definition, deferredIds, hiddenIds);
    if (visibility === "runtime") {
      runtimeOnly.push(definition);
    } else if (visibility === "deferred") {
      deferred.push(definition);
    } else if (visibility === "disabled") {
      disabled.push(definition);
    } else if (maxVisibleTools !== undefined && visible.length >= maxVisibleTools) {
      deferred.push(definition);
    } else {
      visible.push(definition);
    }
  }

  for (const toolId of profile.hiddenToolIds ?? []) {
    const definition = definitionById.get(toolId);
    if (definition !== undefined && !runtimeOnly.some((tool) => tool.id === definition.id)) {
      runtimeOnly.push({ ...definition, visibility: "runtime" });
    }
  }

  return {
    profile: profile.name,
    modelVisible: visible,
    deferred,
    runtimeOnly,
    disabled,
  };
}

function resolveVisibility(
  definition: ToolBaseDefinition,
  deferredIds: ReadonlySet<ToolBaseId>,
  hiddenIds: ReadonlySet<ToolBaseId>,
): ToolBaseVisibility {
  if (hiddenIds.has(definition.id)) {
    return "runtime";
  }
  if (deferredIds.has(definition.id)) {
    return "deferred";
  }
  return definition.visibility;
}

function missingToolDefinition(toolId: ToolBaseId): ToolBaseDefinition {
  return {
    id: toolId,
    title: `Missing ${toolId}`,
    layer: "runtime",
    visibility: "disabled",
    risk: "safe",
    interaction: "govern",
    description: "Tool id is referenced by a profile but no semantic definition is registered.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  };
}

function emptyToolSet(profile: ToolBaseProfileName): ToolBaseToolSet {
  return {
    profile,
    modelVisible: [],
    deferred: [],
    runtimeOnly: [],
    disabled: [],
  };
}

export const defaultToolBaseRegistry = createToolBaseRegistry();
