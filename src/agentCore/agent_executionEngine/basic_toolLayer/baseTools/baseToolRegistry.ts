/*
 * 文件定位：Agent 执行引擎 / 基础工具原语层 / 基础工具总注册表。
 * 核心目的：把内置 baseTools 和后续 customTool 收束到同一套 registry。
 * 边界：注册表只负责发现、登记、查询和暴露工具定义，不直接执行工具。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BaseToolDefinition,
  BaseToolHandler,
  BaseToolDependencyDeclaration,
  BaseToolFamily,
  BaseToolRegistrationResult,
  BaseToolRiskLevel,
  BaseToolSource,
} from "./baseToolDefinition.js";
import { builtinBaseToolHandlers, builtinBaseToolHandlersById } from "./builtinBaseToolHandlers.js";

const baseToolsRoot = path.dirname(fileURLToPath(import.meta.url));
const architectureRoot = path.resolve(baseToolsRoot, "../../../../..");
const defaultDocsRoot = path.join(
  architectureRoot,
  "docs",
  "agentCore",
  "agent_executionEngine",
  "basic_toolLayer",
  "baseTools",
);

export type BaseToolRegistryOptions = {
  includeBuiltins?: boolean;
  builtinRoot?: string;
  docsRoot?: string;
};

export type BaseToolRegistrySnapshot = {
  total: number;
  builtins: number;
  customs: number;
  byFamily: Readonly<Record<BaseToolFamily, number>>;
  byRisk: Readonly<Record<BaseToolRiskLevel, number>>;
};

export type BaseToolRegistryLookupResult =
  | {
      ok: true;
      definition: BaseToolDefinition;
    }
  | {
      ok: false;
      error: {
        code: "TOOL_NOT_FOUND";
        message: string;
        publicSafe: true;
      };
    };

export type BaseToolHandlerLookupResult =
  | {
      ok: true;
      handler: BaseToolHandler;
    }
  | {
      ok: false;
      error: {
        code: "TOOL_NOT_FOUND" | "HANDLER_NOT_FOUND";
        message: string;
        publicSafe: true;
      };
    };

export const baseToolRegistryDescriptor = {
  registry: "agentCore.basicTool.registry",
  builtinToolCountTarget: 175,
  supportsCustomTools: true,
  derivesToolSkillFromMarkdownDocs: true,
  agentCoreOwnsRealExecution: false,
} as const;

const familyByDirectory: Readonly<Record<string, BaseToolFamily>> = {
  codeBase: "code",
  shellBase: "shell",
  gitBase: "git",
  mcpBase: "mcp",
  computeruseBase: "computeruse",
  officeBase: "office",
  omniBase: "omni",
  searchBase: "search",
  skillBase: "skill",
};

const normalKeywords = [
  "read",
  "scan",
  "search",
  "ripgrep",
  "inspect",
  "status",
  "history",
  "list",
  "show",
  "trace",
  "detect",
  "view",
  "listen",
  "position",
  "decode",
  "healthCheck",
  "ping",
];

const dangerousKeywords = [
  "delete",
  "remove",
  "reset",
  "restore",
  "revert",
  "clean",
  "push",
  "rebase",
  "overwrite",
  "replaceFile",
  "termination",
  "terminate",
  "permissionRequest",
  "camera",
  "microphone",
  "screenRecording",
  "recording",
  "detached",
  "background",
];

const riskyKeywords = [
  "edit",
  "modify",
  "format",
  "run",
  "command",
  "script",
  "execute",
  "execution",
  "write",
  "create",
  "update",
  "register",
  "unregister",
  "connect",
  "disconnect",
  "fetch",
  "pull",
  "call",
  "stream",
  "generate",
  "encode",
  "move",
  "rename",
  "stash",
  "apply",
  "pop",
  "checkout",
  "merge",
  "switch",
  "clone",
  "initialize",
  "archive",
];

function hasKeyword(toolId: string, keywords: readonly string[]): boolean {
  const normalized = toolId.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function riskForTool(toolId: string): BaseToolRiskLevel {
  if (hasKeyword(toolId, dangerousKeywords)) {
    return "dangerous";
  }

  if (hasKeyword(toolId, riskyKeywords)) {
    return "risky";
  }

  if (hasKeyword(toolId, normalKeywords)) {
    return "normal";
  }

  return "normal";
}

function permissionHintsForTool(family: BaseToolFamily, toolId: string): readonly string[] {
  const hints = new Set<string>();

  if (family === "code" || family === "office" || family === "skill") hints.add("filesystem:read");
  if (family === "shell") hints.add("shell:execute");
  if (family === "git") hints.add("git:read");
  if (family === "mcp") hints.add("mcp:access");
  if (family === "search") hints.add("network:search");
  if (family === "omni") hints.add("media:transform");

  if (family === "computeruse") {
    if (toolId.includes("camera")) hints.add("device:camera");
    if (toolId.includes("microphone")) hints.add("device:microphone");
    if (toolId.includes("screen") || toolId.includes("screenshot")) hints.add("device:screen");
    if (toolId.includes("keyboard")) hints.add("device:keyboard");
    if (toolId.includes("mouse") || toolId.includes("cursor")) hints.add("device:pointer");
  }

  if (hasKeyword(toolId, ["edit", "modify", "write", "delete", "remove", "overwrite", "replaceFile", "format"])) {
    hints.add("filesystem:write");
  }

  if (family === "git" && hasKeyword(toolId, riskyKeywords)) hints.add("git:write");
  if (family === "mcp" && hasKeyword(toolId, ["register", "unregister", "update", "create", "delete"])) {
    hints.add("mcp:write");
  }
  if (family === "skill" && hasKeyword(toolId, ["generate", "iterate", "remove"])) hints.add("skill:write");
  if (family === "search" && toolId.includes("native")) hints.add("filesystem:read");

  return [...hints].sort();
}

function dependenciesForTool(family: BaseToolFamily, toolId: string): readonly BaseToolDependencyDeclaration[] {
  const dependencies: BaseToolDependencyDeclaration[] = [];

  function add(
    dependencyId: string,
    kind: BaseToolDependencyDeclaration["kind"],
    description: string,
    required = true,
  ): void {
    dependencies.push({ dependencyId, kind, required, description });
  }

  if (family === "code") {
    add("workspace-filesystem", "filesystem", "Workspace filesystem access for code tools");
    if (toolId.toLowerCase().includes("ripgrep")) add("rg", "binary", "ripgrep binary for fast code search");
    if (toolId.includes("lsp_")) add("language-server", "service", "Language server service for semantic code tools", false);
  }

  if (family === "shell") add("host-shell", "runtime", "Host shell runtime supplied through executor port");
  if (family === "git") {
    add("git", "binary", "git binary available to the host executor");
    add("git-worktree", "filesystem", "Repository worktree access");
  }
  if (family === "mcp") add("mcp-server", "service", "Configured MCP server or gateway");
  if (family === "office") add("office-parser", "package", "Document parser or converter supplied by host");
  if (family === "omni") add("media-runtime", "runtime", "Media processing or generation runtime supplied by host");
  if (family === "search") add("search-provider", "network", "Search provider or browser search capability");
  if (family === "skill") add("skill-registry", "filesystem", "Skill registry filesystem access");

  if (family === "computeruse") {
    if (toolId.includes("camera")) add("camera-device", "device", "Camera device and user permission gate");
    if (toolId.includes("microphone")) add("microphone-device", "device", "Microphone device and user permission gate");
    if (toolId.includes("screen") || toolId.includes("screenshot")) add("screen-capture", "device", "Screen capture capability and permission gate");
    if (toolId.includes("keyboard")) add("keyboard-control", "device", "Keyboard control capability and permission gate");
    if (toolId.includes("mouse") || toolId.includes("cursor")) add("pointer-control", "device", "Pointer control capability and permission gate");
    if (dependencies.length === 0) add("computer-control", "device", "Generic computer-use control capability and permission gate");
  }

  return dependencies;
}

function titleFromToolId(toolId: string): string {
  return toolId
    .replaceAll("_", " ")
    .replaceAll(".", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function walkToolFiles(root: string, baseRoot = root): readonly string[] {
  const files: string[] = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkToolFiles(full, baseRoot));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) {
      continue;
    }

    const relative = path.relative(baseRoot, full);
    if (relative.split(path.sep).length < 2) {
      continue;
    }

    files.push(full);
  }

  return files.sort();
}

function definitionFromToolFile(
  filePath: string,
  root: string,
  docsRoot: string,
  handlerById: ReadonlyMap<string, BaseToolHandler>,
): BaseToolDefinition {
  const relative = path.relative(root, filePath).split(path.sep).join("/");
  const [directory] = relative.split("/");
  const segments = relative.split("/");
  const family = familyByDirectory[directory ?? ""] ?? "custom";
  const toolId = path.basename(relative, ".ts");
  const group = segments.length >= 3 ? (segments[1] ?? "(flat)") : "(flat)";
  const builtinHandler = handlerById.get(toolId);
  if (builtinHandler !== undefined) {
    return builtinHandler.definition;
  }

  const riskLevel = riskForTool(toolId);
  const docPath = path
    .join(docsRoot, relative.replace(/\.ts$/u, ".md"))
    .split(path.sep)
    .join("/");
  const sourcePath = path
    .join("src", "agentCore", "agent_executionEngine", "basic_toolLayer", "baseTools", relative)
    .split(path.sep)
    .join("/");

  return {
    toolId,
    source: "builtin",
    family,
    group,
    title: titleFromToolId(toolId),
    description: `Builtin ${family} baseTool: ${toolId}`,
    toolSkill: {
      docPath,
      summary: `Use ${toolId} when this builtin ${family} baseTool matches the task.`,
      riskLevel,
    },
    inputSchema: { kind: "pending-schema", name: `${toolId}.input` },
    outputSchema: { kind: "pending-schema", name: `${toolId}.output` },
    riskLevel,
    permissionHints: permissionHintsForTool(family, toolId),
    dependencies: dependenciesForTool(family, toolId),
    storagePolicy: {
      storesMaterial: true,
      storesResult: true,
      storesAudit: true,
      reusable: riskLevel === "normal",
    },
    sourcePath,
    metadata: {
      relativePath: relative,
      skillDocExists: existsSync(docPath),
    },
  };
}

function emptyFamilyCounts(): Record<BaseToolFamily, number> {
  return {
    code: 0,
    shell: 0,
    git: 0,
    mcp: 0,
    computeruse: 0,
    office: 0,
    omni: 0,
    search: 0,
    skill: 0,
    custom: 0,
  };
}

function emptyRiskCounts(): Record<BaseToolRiskLevel, number> {
  return {
    normal: 0,
    risky: 0,
    dangerous: 0,
  };
}

export class BaseToolRegistry {
  readonly #definitions = new Map<string, BaseToolDefinition>();
  readonly #handlers = new Map<string, BaseToolHandler>();

  constructor(definitions: readonly BaseToolDefinition[] = [], handlers: readonly BaseToolHandler[] = []) {
    for (const definition of definitions) {
      this.#definitions.set(definition.toolId, definition);
    }

    for (const handler of handlers) {
      this.#handlers.set(handler.definition.toolId, handler);
      this.#definitions.set(handler.definition.toolId, handler.definition);
    }
  }

  list(): readonly BaseToolDefinition[] {
    return [...this.#definitions.values()].sort((left, right) => left.toolId.localeCompare(right.toolId));
  }

  lookup(toolId: string): BaseToolRegistryLookupResult {
    const definition = this.#definitions.get(toolId);
    if (definition === undefined) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `baseTool ${toolId} is not registered`,
          publicSafe: true,
        },
      };
    }

    return { ok: true, definition };
  }

  lookupHandler(toolId: string): BaseToolHandlerLookupResult {
    if (!this.#definitions.has(toolId)) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `baseTool ${toolId} is not registered`,
          publicSafe: true,
        },
      };
    }

    const handler = this.#handlers.get(toolId);
    if (handler === undefined) {
      return {
        ok: false,
        error: {
          code: "HANDLER_NOT_FOUND",
          message: `baseTool ${toolId} does not have an executable handler yet`,
          publicSafe: true,
        },
      };
    }

    return { ok: true, handler };
  }

  registerCustomTool(definition: BaseToolDefinition, options: { replace?: boolean; handler?: BaseToolHandler } = {}): BaseToolRegistrationResult {
    if (definition.toolId.trim().length === 0) {
      return {
        ok: false,
        error: { code: "MISSING_TOOL_ID", message: "custom baseTool requires toolId", publicSafe: true },
      };
    }

    if (definition.source !== "custom") {
      return {
        ok: false,
        error: {
          code: "RESERVED_BUILTIN_SOURCE",
          message: "custom baseTool registration must use source=custom",
          publicSafe: true,
        },
      };
    }

    if (this.#definitions.has(definition.toolId) && options.replace !== true) {
      return {
        ok: false,
        error: {
          code: "DUPLICATE_TOOL_ID",
          message: `baseTool ${definition.toolId} is already registered`,
          publicSafe: true,
        },
      };
    }

    this.#definitions.set(definition.toolId, definition);
    if (options.handler !== undefined) {
      this.#handlers.set(definition.toolId, options.handler);
    }
    return { ok: true, definition };
  }

  snapshot(): BaseToolRegistrySnapshot {
    const byFamily = emptyFamilyCounts();
    const byRisk = emptyRiskCounts();
    let builtins = 0;
    let customs = 0;

    for (const definition of this.#definitions.values()) {
      byFamily[definition.family] += 1;
      byRisk[definition.riskLevel] += 1;
      if (definition.source === "builtin") builtins += 1;
      if (definition.source === "custom") customs += 1;
    }

    return {
      total: this.#definitions.size,
      builtins,
      customs,
      byFamily,
      byRisk,
    };
  }
}

export function loadBuiltinBaseToolDefinitions(options: BaseToolRegistryOptions = {}): readonly BaseToolDefinition[] {
  const root = options.builtinRoot ?? baseToolsRoot;
  const docsRoot = options.docsRoot ?? defaultDocsRoot;
  const handlerById = builtinBaseToolHandlersById();

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }

  return walkToolFiles(root).map((filePath) => definitionFromToolFile(filePath, root, docsRoot, handlerById));
}

export function loadBuiltinBaseToolHandlers(): readonly BaseToolHandler[] {
  return builtinBaseToolHandlers;
}

export function createBaseToolRegistry(options: BaseToolRegistryOptions = {}): BaseToolRegistry {
  const includeBuiltins = options.includeBuiltins ?? true;
  return new BaseToolRegistry(
    includeBuiltins ? loadBuiltinBaseToolDefinitions(options) : [],
    includeBuiltins ? loadBuiltinBaseToolHandlers() : [],
  );
}
