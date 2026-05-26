import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { resolveMemoryLayouts, scopeMatches } from "./layout.js";
import { withMemoryLock } from "./lock.js";
import { describeMemoryRisk } from "./risk.js";
import { readMemoryIndex, reindexMemoryLayouts } from "./sqliteIndex.js";
import { dailyMemoryTemplate, longTermMemoryTemplate } from "./templates.js";
import type {
  MemoryIndexStatus,
  MemoryPlane,
  MemoryPlaneOptions,
  MemoryProfile,
  MemoryPromptGuide,
  MemoryReindexResult,
  MemorySearchGuide,
  MemorySearchRequest,
} from "./types.js";

function resolveProfile(options: MemoryPlaneOptions): MemoryProfile {
  return options.profile ?? "readonly";
}

export function createMemoryPlane(options: MemoryPlaneOptions = {}): MemoryPlane {
  const profile = resolveProfile(options);
  const layouts = resolveMemoryLayouts(options);

  return {
    profile,
    layouts: () => layouts,
    async initialize() {
      if (profile === "off") {
        return statusFromIndex(profile, layouts, { indexAvailable: false, indexedFiles: [], artifactRefs: [] });
      }
      for (const layout of layouts) {
        await withMemoryLock(layout.lockDir, async () => {
          await mkdir(layout.root, { recursive: true });
          await mkdir(layout.dailyDir, { recursive: true });
          await mkdir(layout.artifactDir, { recursive: true });
          if (!existsSync(layout.longTermPath)) {
            await writeFile(layout.longTermPath, longTermMemoryTemplate(layout), "utf8");
          }
          if (!existsSync(layout.dailyPath)) {
            await writeFile(layout.dailyPath, dailyMemoryTemplate(path.basename(layout.dailyPath, ".md")), "utf8");
          }
        });
      }
      const indexed = await readMemoryIndex(layouts);
      return statusFromIndex(profile, layouts, indexed);
    },
    async reindex(input = {}) {
      if (profile === "off") {
        return {
          ok: true,
          profile,
          changedFiles: [],
          indexedFiles: [],
          artifactRefs: [],
        };
      }
      await this.initialize();
      try {
        const result = await withAllMemoryLocks(layouts, async () => reindexMemoryLayouts(layouts));
        return { ...result, profile };
      } catch (error) {
        return {
          ok: false,
          profile,
          changedFiles: [],
          indexedFiles: [],
          artifactRefs: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async indexStatus() {
      if (profile === "off") {
        return statusFromIndex(profile, layouts, { indexAvailable: false, indexedFiles: [], artifactRefs: [] });
      }
      const indexed = await readMemoryIndex(layouts);
      return statusFromIndex(profile, layouts, indexed);
    },
    async search(input: MemorySearchRequest) {
      return buildSearchGuide(layouts, input);
    },
    async buildPromptGuide(input = {}) {
      const query = input.query?.trim();
      const searchGuide = query !== undefined && query.length > 0 ? buildSearchGuide(layouts, { query }) : undefined;
      const fullGuide = [
        "Memory is passive durable project/global context, not an active MP/RAG system.",
        "Use basetool file.search over the listed memory roots when prior project/global facts may matter.",
        "Read MEMORY.md for stable facts and daily/YYYY-MM-DD.md for append-only working notes.",
        "Do not treat session transcripts as memory unless the application explicitly exposes them.",
        "Do not use embeddings for this memoryPlane; prefer exact search and file reads.",
        `Profile: ${profile}.`,
        ...layouts.map((layout) => `${layout.scope}: ${layout.root}`),
      ].join("\n");
      const budget = input.budgetChars ?? fullGuide.length;
      return {
        kind: "memory.promptGuide",
        profile,
        enabled: profile !== "off",
        roots: layouts,
        guide: fullGuide.slice(0, Math.max(0, budget)),
        searchGuide,
      } satisfies MemoryPromptGuide;
    },
    describeRisk: describeMemoryRisk,
  };
}

export const memoryPlane = Object.freeze({
  create: createMemoryPlane,
  initialize: async (options?: MemoryPlaneOptions) => createMemoryPlane(options).initialize(),
  reindex: async (options?: MemoryPlaneOptions & { force?: boolean }) => {
    const { force, ...planeOptions } = options ?? {};
    return createMemoryPlane(planeOptions).reindex({ force });
  },
  indexStatus: async (options?: MemoryPlaneOptions) => createMemoryPlane(options).indexStatus(),
  search: async (input: MemorySearchRequest & MemoryPlaneOptions) => {
    const { query, scope, sourceTypes, glob, ...planeOptions } = input;
    return createMemoryPlane(planeOptions).search({ query, scope, sourceTypes, glob });
  },
  buildPromptGuide: async (options?: MemoryPlaneOptions & { query?: string; budgetChars?: number }) => {
    const { query, budgetChars, ...planeOptions } = options ?? {};
    return createMemoryPlane(planeOptions).buildPromptGuide({ query, budgetChars });
  },
  describeRisk: describeMemoryRisk,
});

function statusFromIndex(
  profile: MemoryProfile,
  layouts: ReturnType<typeof resolveMemoryLayouts>,
  indexed: Awaited<ReturnType<typeof readMemoryIndex>>,
): MemoryIndexStatus {
  return {
    ok: indexed.error === undefined,
    profile,
    roots: layouts,
    indexedFiles: indexed.indexedFiles,
    artifactRefs: indexed.artifactRefs,
    indexAvailable: indexed.indexAvailable,
    error: indexed.error,
  };
}

async function withAllMemoryLocks<T>(layouts: ReturnType<typeof resolveMemoryLayouts>, fn: () => Promise<T>): Promise<T> {
  const ordered = [...layouts].sort((left, right) => left.lockDir.localeCompare(right.lockDir));
  const run = ordered.reduceRight<() => Promise<T>>(
    (next, layout) => () => withMemoryLock(layout.lockDir, next),
    fn,
  );
  return await run();
}

function buildSearchGuide(layouts: ReturnType<typeof resolveMemoryLayouts>, input: MemorySearchRequest): MemorySearchGuide {
  const query = input.query.trim();
  if (query.length === 0) {
    throw new Error("memory search query cannot be empty.");
  }
  const matchedLayouts = layouts.filter((layout) => scopeMatches(layout, input.scope));
  const glob = input.glob ?? buildGlob(input.sourceTypes);
  return {
    kind: "basetool.file.search.guide",
    query,
    toolId: "file.search",
    roots: matchedLayouts.map((layout) => layout.root),
    suggestedInputs: matchedLayouts.map((layout) => ({
      query,
      cwd: layout.root,
      glob,
    })),
    instructions: "Call basetool file.search with these roots, then use file.read on matching Markdown files. MEMORY.md is stable memory; daily/*.md is append-only working memory. Session transcripts are not included by default.",
  };
}

function buildGlob(sourceTypes: readonly string[] | undefined): string {
  if (sourceTypes === undefined || sourceTypes.length === 0) return "**/*.md";
  if (sourceTypes.length > 1) return "**/*.md";
  if (sourceTypes.includes("longTerm")) return "MEMORY.md";
  if (sourceTypes.includes("dailyNote")) return "daily/*.md";
  if (sourceTypes.includes("artifact")) return "artifacts/*.md";
  return "**/*.md";
}
