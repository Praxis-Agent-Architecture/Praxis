/*
 * Runtime storage plane / initialization plan.
 * Purpose: describe and optionally apply directory creation without storing secrets.
 */

import { mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";

import type { RaxStorageLayout } from "./raxStorageLayout.js";

export type RaxStorageInitDirectory = {
  path: string;
  scope: "home" | "workspace" | "agent";
  existing: boolean;
};

export type RaxStorageInitPlan = {
  kind: "praxis.raxStorageInitPlan";
  layoutProtocol: RaxStorageLayout["protocolVersion"];
  directories: readonly RaxStorageInitDirectory[];
  files: readonly [];
  createsDirectories: true;
  createsFiles: false;
  writesSecrets: false;
  gitignoreRecommendation: readonly [".rax_workspace/"];
};

export type RaxStorageInitResult = {
  ok: true;
  createdDirectories: readonly string[];
  skippedDirectories: readonly string[];
  events: readonly string[];
};

function existsDirectory(input: string): boolean {
  try {
    return existsSync(input) && statSync(input).isDirectory();
  } catch {
    return false;
  }
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function planRaxStorageInit(layout: RaxStorageLayout): RaxStorageInitPlan {
  const homeDirectories = [
    layout.home.root,
    layout.home.config,
    layout.home.authRefs,
    layout.home.providerProfiles,
    layout.home.packageCache,
    layout.home.toolDeps,
    layout.home.trust,
    layout.home.logs,
    layout.home.runtimeSockets,
    layout.home.templates,
  ];
  const workspaceDirectories = [
    layout.workspace.root,
    layout.workspace.config,
    layout.workspace.manifests,
    layout.workspace.sessions,
    layout.workspace.state,
    layout.workspace.events,
    layout.workspace.approvals,
    layout.workspace.artifacts,
    layout.workspace.cache,
    layout.workspace.sandbox,
    layout.workspace.reports,
    layout.workspace.agentsRoot,
  ];
  const agentDirectories = layout.workspace.agent === undefined
    ? []
    : [
        layout.workspace.agent.root,
        layout.workspace.agent.manifests,
        layout.workspace.agent.sessions,
        layout.workspace.agent.state,
        layout.workspace.agent.events,
        layout.workspace.agent.approvals,
        layout.workspace.agent.artifacts,
        layout.workspace.agent.cache,
        layout.workspace.agent.reports,
      ];

  return {
    kind: "praxis.raxStorageInitPlan",
    layoutProtocol: layout.protocolVersion,
    directories: [
      ...unique(homeDirectories).map((directory): RaxStorageInitDirectory => ({
        path: directory,
        scope: "home",
        existing: existsDirectory(directory),
      })),
      ...unique(workspaceDirectories).map((directory): RaxStorageInitDirectory => ({
        path: directory,
        scope: "workspace",
        existing: existsDirectory(directory),
      })),
      ...unique(agentDirectories).map((directory): RaxStorageInitDirectory => ({
        path: directory,
        scope: "agent",
        existing: existsDirectory(directory),
      })),
    ],
    files: [],
    createsDirectories: true,
    createsFiles: false,
    writesSecrets: false,
    gitignoreRecommendation: [".rax_workspace/"],
  };
}

export async function applyRaxStorageInitPlan(plan: RaxStorageInitPlan): Promise<RaxStorageInitResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const directory of plan.directories) {
    if (directory.existing || existsDirectory(directory.path)) {
      skipped.push(directory.path);
      continue;
    }
    await mkdir(directory.path, { recursive: true });
    created.push(directory.path);
  }

  return {
    ok: true,
    createdDirectories: created,
    skippedDirectories: skipped,
    events: ["runtime.storagePlane.init.applied"],
  };
}
