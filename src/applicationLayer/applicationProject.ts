/*
 * 文件定位：Praxis framework / applicationLayer 项目加载。
 * 核心目的：从 rax.project.json 解析应用项目，定位 agent 入口和项目惯例目录。
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type PraxisApplicationProjectDescriptor = {
  schema?: string;
  kind?: string;
  id: string;
  entry: string;
  export?: string;
  agents?: Readonly<Record<string, string | {
    entry: string;
    export?: string;
    id?: string;
  }>>;
  application?: {
    id?: string;
  };
  agent?: {
    id?: string;
  };
  paths?: Readonly<Record<string, string>>;
};

export type PraxisApplicationProject = {
  projectRoot: string;
  descriptorPath: string;
  descriptor: PraxisApplicationProjectDescriptor;
  projectId: string;
  applicationId: string;
  agentEntryPath: string;
  exportName?: string;
  agentEntries: Readonly<Record<string, {
    entryPath: string;
    exportName?: string;
    agentId?: string;
  }>>;
  paths: Readonly<Record<string, string>>;
};

export type PraxisApplicationProjectResult =
  | {
      ok: true;
      project: PraxisApplicationProject;
    }
  | {
      ok: false;
      error: {
        code: "PROJECT_NOT_FOUND" | "PROJECT_DESCRIPTOR_INVALID" | "AGENT_ENTRY_NOT_FOUND";
        message: string;
      };
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeDescriptor(value: unknown): PraxisApplicationProjectDescriptor | undefined {
  if (!isRecord(value) || !isString(value.id) || !isString(value.entry)) {
    return undefined;
  }
  const application = isRecord(value.application) && isString(value.application.id)
    ? { id: value.application.id.trim() }
    : undefined;
  const agent = isRecord(value.agent) && isString(value.agent.id)
    ? { id: value.agent.id.trim() }
    : undefined;
  const paths = isRecord(value.paths)
    ? Object.fromEntries(Object.entries(value.paths).filter((entry): entry is [string, string] => isString(entry[1])))
    : {};
  const agents = isRecord(value.agents)
    ? Object.fromEntries(Object.entries(value.agents).flatMap(([key, entry]) => {
        if (!isString(key)) return [];
        if (isString(entry)) {
          return [[key, { entry: entry.trim() }]];
        }
        if (isRecord(entry) && isString(entry.entry)) {
          return [[key, {
            entry: entry.entry.trim(),
            ...(isString(entry.export) ? { export: entry.export.trim() } : {}),
            ...(isString(entry.id) ? { id: entry.id.trim() } : {}),
          }]];
        }
        return [];
      }))
    : undefined;
  return {
    id: value.id.trim(),
    entry: value.entry.trim(),
    ...(isString(value.schema) ? { schema: value.schema.trim() } : {}),
    ...(isString(value.kind) ? { kind: value.kind.trim() } : {}),
    ...(isString(value.export) ? { export: value.export.trim() } : {}),
    ...(agents && Object.keys(agents).length > 0 ? { agents } : {}),
    ...(application ? { application } : {}),
    ...(agent ? { agent } : {}),
    paths,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadApplicationProject(projectRoot: string): Promise<PraxisApplicationProjectResult> {
  const absoluteRoot = path.resolve(projectRoot);
  const descriptorPath = path.join(absoluteRoot, "rax.project.json");
  if (!await exists(descriptorPath)) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `rax.project.json was not found under ${absoluteRoot}`,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(descriptorPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "PROJECT_DESCRIPTOR_INVALID",
        message: error instanceof Error ? error.message : "failed to parse rax.project.json",
      },
    };
  }

  const descriptor = normalizeDescriptor(parsed);
  if (!descriptor) {
    return {
      ok: false,
      error: {
        code: "PROJECT_DESCRIPTOR_INVALID",
        message: "rax.project.json must include non-empty id and entry fields",
      },
    };
  }

  const agentEntryPath = path.resolve(absoluteRoot, descriptor.entry);
  if (!await exists(agentEntryPath)) {
    return {
      ok: false,
      error: {
        code: "AGENT_ENTRY_NOT_FOUND",
        message: `application agent entry was not found: ${agentEntryPath}`,
      },
    };
  }
  const agentEntries: Record<string, { entryPath: string; exportName?: string; agentId?: string }> = {
    primary: {
      entryPath: agentEntryPath,
      ...(descriptor.export ? { exportName: descriptor.export } : {}),
      ...(descriptor.agent?.id ? { agentId: descriptor.agent.id } : {}),
    },
  };
  for (const [key, entry] of Object.entries(descriptor.agents ?? {})) {
    const normalized = typeof entry === "string" ? { entry } : entry;
    const entryPath = path.resolve(absoluteRoot, normalized.entry);
    if (!await exists(entryPath)) {
      return {
        ok: false,
        error: {
          code: "AGENT_ENTRY_NOT_FOUND",
          message: `application agent entry was not found for ${key}: ${entryPath}`,
        },
      };
    }
    agentEntries[key] = {
      entryPath,
      ...(normalized.export ? { exportName: normalized.export } : {}),
      ...(normalized.id ? { agentId: normalized.id } : {}),
    };
  }

  return {
    ok: true,
    project: {
      projectRoot: absoluteRoot,
      descriptorPath,
      descriptor,
      projectId: descriptor.id,
      applicationId: descriptor.application?.id ?? `application.${descriptor.id}`,
      agentEntryPath,
      exportName: descriptor.export,
      agentEntries,
      paths: descriptor.paths ?? {},
    },
  };
}
