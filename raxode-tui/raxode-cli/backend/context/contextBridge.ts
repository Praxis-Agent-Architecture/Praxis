import path from "node:path";
import { readFile } from "node:fs/promises";

import type { BaseToolExecutorNamespace } from "@praxis-ai/praxis/basetool";

export type RaxodeContextBridgeOptions = {
  projectRoot: string;
  cwd?: string;
  memoryRoots?: readonly string[];
};

export const cmpBridge = {
  moduleId: "context.raxode.praxisContextBridge",
  status: "ready",
  purpose: "Expose Raxode workspace/project context through Praxis applicationLayer and the context.load basetool port.",
  surfaces: [
    "declaredRuntimeContext",
    "projectContext",
    "retrievedContext",
    "context.load",
  ],
  ownership: "application-layer",
} as const;

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readSafeText(root: string, ref: string, limit: number): Promise<string> {
  const absolute = path.isAbsolute(ref) ? path.resolve(ref) : path.resolve(root, ref);
  if (!isInside(root, absolute)) {
    throw new Error(`context ref is outside the project root: ${ref}`);
  }
  const content = await readFile(absolute, "utf8");
  return content.slice(0, Math.max(0, limit));
}

export function createRaxodeContextAdapter(options: RaxodeContextBridgeOptions): BaseToolExecutorNamespace {
  const projectRoot = path.resolve(options.projectRoot);
  const cwd = path.resolve(options.cwd ?? projectRoot);
  const memoryRoots = [...(options.memoryRoots ?? [])].map((root) => path.resolve(root));

  return {
    async load(request: {
      kind?: string;
      ref?: string;
      query?: string;
      limit?: number;
    }) {
      const kind = request.kind ?? "workspaceIndex";
      const limit = typeof request.limit === "number" ? request.limit : 12_000;
      if (kind === "workspaceIndex") {
        return {
          kind: "raxode.context.workspaceIndex",
          projectRoot,
          cwd,
          query: request.query,
          memoryRoots,
          guidance: [
            "Use file.search/file.read for concrete workspace evidence.",
            "Use memory roots only for durable project/global facts exposed by the application.",
          ],
        };
      }
      if (kind === "session") {
        return {
          kind: "raxode.context.session",
          ref: request.ref,
          projectRoot,
          cwd,
          guidance: "Session state is persisted by Praxis applicationLayer/foundationProject; ask the application surface for full transcript views.",
        };
      }
      if (kind === "artifact" || kind === "observation") {
        if (typeof request.ref !== "string" || request.ref.trim().length === 0) {
          throw new Error(`context.load ${kind} requires a ref.`);
        }
        return {
          kind: `raxode.context.${kind}`,
          ref: request.ref,
          text: await readSafeText(projectRoot, request.ref, limit),
          truncated: false,
        };
      }
      throw new Error(`unsupported Raxode context kind: ${kind}`);
    },
  };
}
