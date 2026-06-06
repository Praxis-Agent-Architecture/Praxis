/*
 * 文件定位：Runtime Skill Plane / 技能索引与按需正文加载合约。
 * 核心目的：让 Praxis runtime 能声明、索引、读取和写入可复用技能经验，
 * 但不把技能直接降级成工具声明或外部服务配置。
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import type { PromptPackMaterialDraft } from "../../executionEngine/promptPack/promptDefiner.js";

export type SkillPlaneScope = "agent" | "project" | "workspace" | "user" | "session";

export type SkillPlanePromotionState = "experience" | "skill" | "candidate-mcp-plus" | "mcp-plus" | "tool";

export type SkillHead = {
  skillId: string;
  title: string;
  summary: string;
  scope?: SkillPlaneScope;
  whenToUse?: string;
  why?: string;
  keywords?: readonly string[];
  pitfallsPreview?: readonly string[];
  bodyRef?: string;
  promotedFrom?: readonly string[];
  promotionState?: SkillPlanePromotionState;
};

export type SkillBody = SkillHead & {
  prerequisites?: readonly string[];
  do?: readonly string[];
  avoid?: readonly string[];
  pitfalls?: readonly string[];
  verification?: readonly string[];
  examples?: readonly string[];
  promotionSignals?: readonly string[];
  updatedAt: string;
};

export type SkillSourceSpec =
  | {
      kind: "directory";
      path: string;
      scope?: SkillPlaneScope;
    }
  | {
      kind: "package";
      packageName: string;
      scope?: SkillPlaneScope;
    }
  | {
      kind: "inline";
      heads: readonly SkillHead[];
    };

export type SkillPlaneIndexPolicy = {
  maxHeads: number;
  includeScopes: readonly SkillPlaneScope[];
};

export type SkillPlaneBodyLoadPolicy = {
  mode: "on-demand" | "eager" | "disabled";
  maxBodiesPerTurn: number;
};

export type SkillPlaneLifecyclePolicy = {
  allowWrite: boolean;
  checkpointWrites: boolean;
  promotion: "off" | "suggest" | "auto";
};

export type SkillPlaneModuleSpec = {
  kind: "praxis.skill.module";
  version: "praxis.skill.v1";
  sources: readonly SkillSourceSpec[];
  indexPolicy: SkillPlaneIndexPolicy;
  bodyLoadPolicy: SkillPlaneBodyLoadPolicy;
  lifecycle: SkillPlaneLifecyclePolicy;
  metadata?: Readonly<Record<string, unknown>>;
};

export type SkillPlaneListHeadsQuery = {
  scopes?: readonly SkillPlaneScope[];
};

export type SkillPlaneStore = {
  listHeads(query?: SkillPlaneListHeadsQuery): Promise<readonly SkillHead[]>;
  readBody(skillId: string): Promise<SkillBody | undefined>;
  write(body: SkillBody): Promise<SkillBody>;
};

export type SkillPlaneSourceResolutionInput = {
  workspaceRoot?: string;
};

export type SkillWriteProposal = {
  kind: "praxis.skill.writeProposal";
  body: SkillBody;
  reason?: string;
  safeForRuntimeInspection: true;
};

export type SkillPromotionAdvice = {
  kind: "praxis.skill.promotionAdvice";
  skillId: string;
  from?: SkillPlanePromotionState;
  target: "candidate-mcp-plus";
  autoGenerateTool: false;
  reason?: string;
  signals?: readonly string[];
};

const DEFAULT_INDEX_POLICY: SkillPlaneIndexPolicy = {
  maxHeads: 40,
  includeScopes: ["agent", "project", "workspace"],
};

const DEFAULT_BODY_LOAD_POLICY: SkillPlaneBodyLoadPolicy = {
  mode: "on-demand",
  maxBodiesPerTurn: 3,
};

const DEFAULT_LIFECYCLE_POLICY: SkillPlaneLifecyclePolicy = {
  allowWrite: true,
  checkpointWrites: true,
  promotion: "suggest",
};

export const skill = {
  directory(directoryPath: string, input?: { scope?: SkillPlaneScope }): SkillSourceSpec {
    return input === undefined
      ? { kind: "directory", path: directoryPath }
      : { kind: "directory", path: directoryPath, scope: input.scope };
  },
  package(packageName: string, input?: { scope?: SkillPlaneScope }): SkillSourceSpec {
    return input === undefined
      ? { kind: "package", packageName }
      : { kind: "package", packageName, scope: input.scope };
  },
  inline(heads: readonly SkillHead[]): SkillSourceSpec {
    return { kind: "inline", heads };
  },
  module(input: {
    sources?: readonly SkillSourceSpec[];
    indexPolicy?: Partial<SkillPlaneIndexPolicy>;
    bodyLoadPolicy?: Partial<SkillPlaneBodyLoadPolicy>;
    lifecycle?: Partial<SkillPlaneLifecyclePolicy>;
    metadata?: Readonly<Record<string, unknown>>;
  } = {}): SkillPlaneModuleSpec {
    return {
      kind: "praxis.skill.module",
      version: "praxis.skill.v1",
      sources: input.sources ?? [],
      indexPolicy: {
        ...DEFAULT_INDEX_POLICY,
        ...input.indexPolicy,
      },
      bodyLoadPolicy: {
        ...DEFAULT_BODY_LOAD_POLICY,
        ...input.bodyLoadPolicy,
      },
      lifecycle: {
        ...DEFAULT_LIFECYCLE_POLICY,
        ...input.lifecycle,
      },
      metadata: input.metadata,
    };
  },
} as const;

export function isSkillPlaneModuleSpec(value: unknown): value is SkillPlaneModuleSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "praxis.skill.module" && Array.isArray(record.sources);
}

export function skillPlaneModuleFrom(input: {
  modules?: Readonly<Record<string, unknown>>;
}): SkillPlaneModuleSpec | undefined {
  const candidate = input.modules?.skill;
  return isSkillPlaneModuleSpec(candidate) ? candidate : undefined;
}

export function runtimeRequirementsForSkillModule(
  module: SkillPlaneModuleSpec | undefined,
): readonly string[] {
  return module === undefined ? [] : ["runtime.skill"];
}

function isSkillHeadLike(value: unknown): value is SkillHead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.skillId === "string" && typeof record.title === "string" && typeof record.summary === "string";
}

function headsFromUnknown(value: unknown): SkillHead[] {
  if (Array.isArray(value)) return value.filter(isSkillHeadLike);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skillHeads)) return record.skillHeads.filter(isSkillHeadLike);
  if (Array.isArray(record.heads)) return record.heads.filter(isSkillHeadLike);
  if (Array.isArray(record.skills)) return record.skills.filter(isSkillHeadLike);
  return isSkillHeadLike(value) ? [value] : [];
}

function withSourceScope(heads: readonly SkillHead[], scope: SkillPlaneScope | undefined): readonly SkillHead[] {
  if (scope === undefined) return heads;
  return heads.map((head) => ({
    ...head,
    scope: head.scope ?? scope,
  }));
}

export async function loadSkillHeadsFromSource(
  source: SkillSourceSpec,
  input: SkillPlaneSourceResolutionInput = {},
): Promise<readonly SkillHead[]> {
  if (source.kind === "inline") return source.heads;
  if (source.kind === "package") {
    const module = await import(source.packageName) as Record<string, unknown>;
    return withSourceScope([
      ...headsFromUnknown(module.skillHeads),
      ...headsFromUnknown(module.heads),
      ...headsFromUnknown(module.skills),
      ...headsFromUnknown(module.default),
    ], source.scope);
  }

  const rootDir = path.isAbsolute(source.path)
    ? source.path
    : path.resolve(input.workspaceRoot ?? process.cwd(), source.path);
  let entries: readonly string[];
  try {
    entries = await readdir(rootDir);
  } catch {
    return [];
  }
  const heads = await Promise.all(entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => readJsonFile<unknown>(path.join(rootDir, entry), undefined).then(headsFromUnknown)));
  return withSourceScope(heads.flat(), source.scope);
}

export async function loadSkillHeadsFromSources(
  sources: readonly SkillSourceSpec[],
  input: SkillPlaneSourceResolutionInput = {},
): Promise<readonly SkillHead[]> {
  const heads = await Promise.all(sources.map((source) => loadSkillHeadsFromSource(source, input)));
  return heads.flat();
}

function headFromBody(body: SkillBody): SkillHead {
  return {
    skillId: body.skillId,
    title: body.title,
    summary: body.summary,
    scope: body.scope,
    whenToUse: body.whenToUse,
    why: body.why,
    keywords: body.keywords,
    pitfallsPreview: body.pitfallsPreview,
    bodyRef: body.bodyRef,
    promotedFrom: body.promotedFrom,
    promotionState: body.promotionState,
  };
}

function scopeMatches(head: SkillHead, scopes: readonly SkillPlaneScope[] | undefined): boolean {
  if (scopes === undefined || scopes.length === 0) return true;
  return head.scope !== undefined && scopes.includes(head.scope);
}

function sortHeads(heads: readonly SkillHead[]): SkillHead[] {
  return [...heads].sort((left, right) => left.skillId.localeCompare(right.skillId));
}

export function createInMemorySkillPlaneStore(initialBodies: readonly SkillBody[] = []): SkillPlaneStore {
  const bodies = new Map(initialBodies.map((body) => [body.skillId, body]));
  return {
    async listHeads(query) {
      return sortHeads([...bodies.values()].map(headFromBody).filter((head) => scopeMatches(head, query?.scopes)));
    },
    async readBody(skillId) {
      return bodies.get(skillId);
    },
    async write(body) {
      bodies.set(body.skillId, body);
      return body;
    },
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function skillFilePart(skillId: string): string {
  const sanitized = skillId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "")
    .slice(0, 64)
    .toLowerCase() || "skill";
  const stableSuffix = createHash("sha256").update(skillId).digest("hex").slice(0, 16);
  return `${sanitized}-${stableSuffix}.json`;
}

export function createFileSkillPlaneStore(rootDir: string): SkillPlaneStore {
  function bodyPath(skillId: string): string {
    return path.join(rootDir, skillFilePart(skillId));
  }

  async function listBodies(): Promise<SkillBody[]> {
    let entries: readonly string[];
    try {
      entries = await readdir(rootDir);
    } catch {
      return [];
    }
    const bodies = await Promise.all(entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readJsonFile<SkillBody | undefined>(path.join(rootDir, entry), undefined)));
    return bodies.filter((body): body is SkillBody => body !== undefined && typeof body.skillId === "string");
  }

  return {
    async listHeads(query) {
      return sortHeads((await listBodies()).map(headFromBody).filter((head) => scopeMatches(head, query?.scopes)));
    },
    async readBody(skillId) {
      return await readJsonFile<SkillBody | undefined>(bodyPath(skillId), undefined);
    },
    async write(body) {
      await writeJsonFile(bodyPath(body.skillId), body);
      return body;
    },
  };
}

function compactLine(label: string, value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const rendered = typeof value === "string"
    ? value.trim()
    : value.map((item) => item.trim()).filter(Boolean).join(", ");
  return rendered.length === 0 ? undefined : `${label}: ${rendered}`;
}

export function renderSkillIndexMaterial(heads: readonly SkillHead[]): PromptPackMaterialDraft {
  const lines = ["# Skill Plane Index"];
  for (const head of sortHeads(heads)) {
    lines.push(`- ${head.skillId}: ${head.title}. ${head.summary}`);
    const detailLines = [
      compactLine("  scope", head.scope),
      compactLine("  when", head.whenToUse),
      compactLine("  why", head.why),
      compactLine("  keywords", head.keywords),
      compactLine("  pitfalls preview", head.pitfallsPreview),
      compactLine("  body ref", head.bodyRef),
      compactLine("  promotion", head.promotionState),
    ].filter((line): line is string => line !== undefined);
    lines.push(...detailLines);
  }

  return {
    id: "runtime:skill-plane:index",
    kind: "runtime",
    source: "runtime.skillPlane.index",
    sourceCategory: "declared-built-in",
    trusted: true,
    promptSegmentKind: "skillIndex",
    metadata: {
      promptSegmentKind: "skillIndex",
      generatedBy: "runtime.skillPlane",
    },
    text: lines.join("\n"),
  };
}

export function createSkillWriteProposal(
  body: SkillBody,
  input: { reason?: string } = {},
): SkillWriteProposal {
  return {
    kind: "praxis.skill.writeProposal",
    body,
    reason: input.reason,
    safeForRuntimeInspection: true,
  };
}

export function adviseSkillPromotion(
  skillHead: SkillHead,
  input: { reason?: string; signals?: readonly string[] } = {},
): SkillPromotionAdvice {
  return {
    kind: "praxis.skill.promotionAdvice",
    skillId: skillHead.skillId,
    from: skillHead.promotionState,
    target: "candidate-mcp-plus",
    autoGenerateTool: false,
    reason: input.reason,
    signals: input.signals,
  };
}
