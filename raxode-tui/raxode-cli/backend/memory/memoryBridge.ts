import path from "node:path";

import { memoryPlane, type MemoryProfile, type MemoryPromptGuide } from "@praxis-ai/praxis/memory";

export type RaxodeMemoryBridgeOptions = {
  projectRoot: string;
  cwd?: string;
  profile?: MemoryProfile;
  projectMemoryRoot?: string;
  globalMemoryRoot?: string;
  now?: () => Date | string;
  budgetChars?: number;
};

export type RaxodeMemoryBridgeSnapshot = {
  moduleId: typeof mpBridge.moduleId;
  status: typeof mpBridge.status;
  profile: MemoryProfile;
  enabled: boolean;
  roots: readonly string[];
  promptGuide: string;
};

export const mpBridge = {
  moduleId: "memory.raxode.praxisMemoryBridge",
  status: "ready",
  purpose: "Expose Raxode project/global memory through Praxis memoryPlane and basetool file search/read guidance.",
  surfaces: [
    "memoryContext",
    "sessionSummary",
    "file.search",
    "file.read",
    "memoryPlane.buildPromptGuide",
  ],
  ownership: "application-layer",
} as const;

export function resolveRaxodeProjectMemoryRoot(options: Pick<RaxodeMemoryBridgeOptions, "projectRoot" | "projectMemoryRoot">): string {
  return path.resolve(options.projectMemoryRoot ?? path.join(options.projectRoot, ".rax_workspace", "memory"));
}

export async function buildRaxodeMemoryPromptGuide(
  options: RaxodeMemoryBridgeOptions,
): Promise<MemoryPromptGuide> {
  return await memoryPlane.buildPromptGuide({
    projectMemoryRoot: resolveRaxodeProjectMemoryRoot(options),
    globalMemoryRoot: options.globalMemoryRoot,
    profile: options.profile ?? "readonly",
    now: options.now,
    budgetChars: options.budgetChars ?? 1_600,
  });
}

export async function inspectRaxodeMemoryBridge(
  options: RaxodeMemoryBridgeOptions,
): Promise<RaxodeMemoryBridgeSnapshot> {
  const guide = await buildRaxodeMemoryPromptGuide(options);
  return {
    moduleId: mpBridge.moduleId,
    status: mpBridge.status,
    profile: guide.profile,
    enabled: guide.enabled,
    roots: guide.roots.map((root) => root.root),
    promptGuide: guide.guide,
  };
}
