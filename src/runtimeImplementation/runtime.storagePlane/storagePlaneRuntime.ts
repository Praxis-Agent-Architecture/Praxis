/*
 * Runtime storage plane / composition surface.
 * Purpose: resolve .rax/.rax_workspace, build layout, and provide an init plan
 * that Kernel or rax commands can apply explicitly.
 */

import {
  resolveRaxHome,
  resolveRaxWorkspace,
  type RaxHomeResolution,
  type RaxPathResolutionError,
  type RaxPathResolutionResult,
  type RaxWorkspaceResolution,
} from "./raxPathResolver.js";
import { createRaxStorageLayout, type RaxStorageLayout } from "./raxStorageLayout.js";
import {
  applyRaxStorageInitPlan,
  planRaxStorageInit,
  type RaxStorageInitPlan,
  type RaxStorageInitResult,
} from "./raxStorageInit.js";

export type RaxStorageInitMode = "manual" | "on-run" | "never";

export type StoragePlaneRuntimeInput = {
  cwd?: string;
  raxHome?: string;
  workspaceRoot?: string;
  workspaceFolderName?: string;
  homeDir?: string;
  env?: Readonly<Record<string, string | undefined>>;
  agentId?: string;
  initMode?: RaxStorageInitMode;
};

export type StoragePlaneRuntime = {
  kind: "praxis.storagePlaneRuntime";
  home: RaxHomeResolution;
  workspace: RaxWorkspaceResolution;
  layout: RaxStorageLayout;
  initPlan: RaxStorageInitPlan;
  initMode: RaxStorageInitMode;
  publicSafe: true;
};

export type StoragePlaneRuntimeResult =
  | {
      ok: true;
      runtime: StoragePlaneRuntime;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RaxPathResolutionError;
      events: readonly string[];
    };

export type StoragePlaneRuntimeInitApplyResult =
  | {
      ok: true;
      runtime: StoragePlaneRuntime;
      init: RaxStorageInitResult;
      events: readonly string[];
    }
  | {
      ok: false;
      error: RaxPathResolutionError;
      events: readonly string[];
    };

function passThroughFailure<TValue>(
  result: RaxPathResolutionResult<TValue>,
  events: readonly string[],
): StoragePlaneRuntimeResult {
  if (result.ok) {
    throw new Error("expected storage plane failure");
  }
  return {
    ok: false,
    error: result.error,
    events: [...events, ...result.events],
  };
}

export function createStoragePlaneRuntime(input: StoragePlaneRuntimeInput = {}): StoragePlaneRuntimeResult {
  const events: string[] = [];
  const home = resolveRaxHome({
    explicitHome: input.raxHome,
    homeDir: input.homeDir,
    env: input.env,
  });
  if (!home.ok) {
    return passThroughFailure(home, events);
  }
  events.push(...home.events);

  const workspace = resolveRaxWorkspace({
    cwd: input.cwd,
    explicitWorkspaceRoot: input.workspaceRoot,
    workspaceFolderName: input.workspaceFolderName,
  });
  if (!workspace.ok) {
    return passThroughFailure(workspace, events);
  }
  events.push(...workspace.events);

  const layout = createRaxStorageLayout({
    raxHomeRoot: home.value.root,
    raxWorkspaceRoot: workspace.value.root,
    agentId: input.agentId,
  });
  if (!layout.ok) {
    return passThroughFailure(layout, events);
  }
  events.push(...layout.events);

  return {
    ok: true,
    runtime: {
      kind: "praxis.storagePlaneRuntime",
      home: home.value,
      workspace: workspace.value,
      layout: layout.value,
      initPlan: planRaxStorageInit(layout.value),
      initMode: input.initMode ?? "manual",
      publicSafe: true,
    },
    events: [...events, "runtime.storagePlaneRuntime.created"],
  };
}

export async function createAndApplyStoragePlaneRuntime(
  input: StoragePlaneRuntimeInput = {},
): Promise<StoragePlaneRuntimeInitApplyResult> {
  const runtime = createStoragePlaneRuntime(input);
  if (!runtime.ok) {
    return runtime;
  }

  const init = await applyRaxStorageInitPlan(runtime.runtime.initPlan);
  return {
    ok: true,
    runtime: runtime.runtime,
    init,
    events: [...runtime.events, ...init.events],
  };
}

export {
  resolveRaxHome,
  resolveRaxWorkspace,
  type RaxHomeResolution,
  type RaxPathResolutionError,
  type RaxPathResolutionErrorCode,
  type RaxPathResolutionResult,
  type RaxWorkspaceResolution,
} from "./raxPathResolver.js";

export {
  createRaxStorageLayout,
  type RaxStorageHomeLayout,
  type RaxStorageLayout,
  type RaxStorageLayoutRefs,
  type RaxStorageWorkspaceLayout,
} from "./raxStorageLayout.js";

export {
  applyRaxStorageInitPlan,
  planRaxStorageInit,
  type RaxStorageInitDirectory,
  type RaxStorageInitPlan,
  type RaxStorageInitResult,
} from "./raxStorageInit.js";
