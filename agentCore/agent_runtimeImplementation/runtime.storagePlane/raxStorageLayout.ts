/*
 * Runtime storage plane / directory layout.
 * Purpose: keep .rax and .rax_workspace protocols inspectable and stable.
 */

import path from "node:path";

import {
  assertChildPath,
  safeAgentStorageId,
  type RaxPathResolutionError,
  type RaxPathResolutionResult,
} from "./raxPathResolver.js";

export type RaxStorageHomeLayout = {
  root: string;
  config: string;
  authRefs: string;
  providerProfiles: string;
  packageCache: string;
  toolDeps: string;
  trust: string;
  logs: string;
  runtimeSockets: string;
  templates: string;
};

export type RaxAgentWorkspaceLayout = {
  agentId: string;
  root: string;
  manifests: string;
  sessions: string;
  state: string;
  events: string;
  approvals: string;
  artifacts: string;
  cache: string;
  reports: string;
};

export type RaxStorageWorkspaceLayout = {
  root: string;
  config: string;
  manifests: string;
  sessions: string;
  sessionSqlitePath: string;
  state: string;
  events: string;
  approvals: string;
  artifacts: string;
  cache: string;
  sandbox: string;
  reports: string;
  agentsRoot: string;
  agent?: RaxAgentWorkspaceLayout;
};

export type RaxStorageLayoutRefs = {
  homeRef: "rax.home";
  workspaceRef: "rax.workspace";
  sessionStoreRef: "session.sqlite.workspace";
  artifactRootRef: "artifact.workspace";
  cacheRootRef: "cache.workspace";
  sandboxRootRef: "sandbox.workspace";
};

export type RaxStorageLayout = {
  kind: "praxis.raxStorageLayout";
  protocolVersion: "praxis.raxStorage.v1";
  home: RaxStorageHomeLayout;
  workspace: RaxStorageWorkspaceLayout;
  refs: RaxStorageLayoutRefs;
  publicSafe: true;
};

export type RaxStorageLayoutInput = {
  raxHomeRoot: string;
  raxWorkspaceRoot: string;
  agentId?: string;
};

function layoutFailure(message: string, error?: RaxPathResolutionError): RaxPathResolutionResult<RaxStorageLayout> {
  return {
    ok: false,
    error: error ?? {
      code: "PATH_ESCAPE",
      message,
      boundary: "security",
      publicSafe: true,
    },
    events: ["runtime.storagePlane.layout.rejected"],
  };
}

function child(root: string, ...segments: string[]): string {
  return path.join(root, ...segments);
}

function ensureChild(root: string, value: string): RaxPathResolutionResult<string> {
  return assertChildPath(root, value);
}

function createAgentLayout(workspaceRoot: string, agentId: string): RaxPathResolutionResult<RaxAgentWorkspaceLayout> {
  const safeId = safeAgentStorageId(agentId);
  if (!safeId.ok) {
    return safeId;
  }

  const root = child(workspaceRoot, "agents", safeId.value);
  const checked = ensureChild(workspaceRoot, root);
  if (!checked.ok) {
    return checked;
  }

  return {
    ok: true,
    value: {
      agentId: safeId.value,
      root,
      manifests: child(root, "manifests"),
      sessions: child(root, "sessions"),
      state: child(root, "state"),
      events: child(root, "events"),
      approvals: child(root, "approvals"),
      artifacts: child(root, "artifacts"),
      cache: child(root, "cache"),
      reports: child(root, "reports"),
    },
    events: ["runtime.storagePlane.agentLayout.created"],
  };
}

export function createRaxStorageLayout(input: RaxStorageLayoutInput): RaxPathResolutionResult<RaxStorageLayout> {
  const homeRoot = path.resolve(input.raxHomeRoot);
  const workspaceRoot = path.resolve(input.raxWorkspaceRoot);
  const workspaceCheck = ensureChild(path.dirname(workspaceRoot), workspaceRoot);
  if (!workspaceCheck.ok) {
    return layoutFailure("Praxis workspace root must be a safe child path", workspaceCheck.error);
  }

  const agent = input.agentId === undefined ? undefined : createAgentLayout(workspaceRoot, input.agentId);
  if (agent !== undefined && !agent.ok) {
    return layoutFailure(agent.error.message, agent.error);
  }

  const layout: RaxStorageLayout = {
    kind: "praxis.raxStorageLayout",
    protocolVersion: "praxis.raxStorage.v1",
    home: {
      root: homeRoot,
      config: child(homeRoot, "config"),
      authRefs: child(homeRoot, "auth"),
      providerProfiles: child(homeRoot, "providers"),
      packageCache: child(homeRoot, "packages"),
      toolDeps: child(homeRoot, "tool-deps"),
      trust: child(homeRoot, "trust"),
      logs: child(homeRoot, "logs"),
      runtimeSockets: child(homeRoot, "runtime"),
      templates: child(homeRoot, "templates"),
    },
    workspace: {
      root: workspaceRoot,
      config: child(workspaceRoot, "config"),
      manifests: child(workspaceRoot, "manifests"),
      sessions: child(workspaceRoot, "sessions"),
      sessionSqlitePath: child(workspaceRoot, "sessions", "praxis.sqlite"),
      state: child(workspaceRoot, "state"),
      events: child(workspaceRoot, "events"),
      approvals: child(workspaceRoot, "approvals"),
      artifacts: child(workspaceRoot, "artifacts"),
      cache: child(workspaceRoot, "cache"),
      sandbox: child(workspaceRoot, "sandbox"),
      reports: child(workspaceRoot, "reports"),
      agentsRoot: child(workspaceRoot, "agents"),
      agent: agent?.value,
    },
    refs: {
      homeRef: "rax.home",
      workspaceRef: "rax.workspace",
      sessionStoreRef: "session.sqlite.workspace",
      artifactRootRef: "artifact.workspace",
      cacheRootRef: "cache.workspace",
      sandboxRootRef: "sandbox.workspace",
    },
    publicSafe: true,
  };

  return {
    ok: true,
    value: layout,
    events: [
      "runtime.storagePlane.layout.created",
      ...(agent?.events ?? []),
    ],
  };
}
