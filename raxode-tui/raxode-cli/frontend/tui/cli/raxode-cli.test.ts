import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildBackendReadinessStatusLines,
  hasConfiguredPrimaryModelAuth,
  raxodeBackendOptionsFromResolvedRole,
  resolveRaxodeCliCommand,
  resolveRaxodeLaunchPlan,
} from "./raxode-cli.js";
import type { RaxodeResolvedRoleConfig } from "../config/raxode-config.js";
import { ensureRaxodeHomeScaffold } from "../config/raxode-config.js";

test("resolveRaxodeCliCommand defaults bare raxode to tui", () => {
  assert.deepEqual(resolveRaxodeCliCommand([]), {
    command: "tui",
    rest: [],
  });
  assert.deepEqual(resolveRaxodeCliCommand(["--help"]), {
    command: "help",
    rest: [],
  });
  assert.deepEqual(resolveRaxodeCliCommand(["status"]), {
    command: "status",
    rest: [],
  });
  assert.deepEqual(resolveRaxodeCliCommand(["resume", "session-1"]), {
    command: "resume",
    rest: ["session-1"],
  });
});

test("buildBackendReadinessStatusLines exposes Praxis module readiness", () => {
  const lines = buildBackendReadinessStatusLines({
    now: () => "2026-05-10T00:00:00.000Z",
    localProbe: {
      nodeVersion: "v22.22.3",
      resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
    },
  });

  assert.ok(lines.some((line) => line === "Praxis backend readiness: ready"));
  assert.ok(lines.some((line) => line.includes("Praxis backend modules: modules=ready")));
  assert.ok(lines.some((line) => line === "Praxis backend module gaps: none"));
  assert.ok(lines.some((line) =>
    line === "Praxis backend runtime ports: approval=default-policy, agentReview=not-configured, contextArtifact=configured, baseTool=not-configured, authState=configured, foundation=configured, liveProvider=raxode-default"));
  assert.ok(lines.some((line) => line === "Praxis backend model: provider=openai, model=gpt-5.5, route=responses"));
  assert.ok(lines.some((line) => line === "Praxis backend tools: agentCore mounted=25 expected=25"));
  assert.ok(lines.some((line) => line.includes("Praxis backend sandbox: host-observed")));
  assert.ok(lines.some((line) => line.includes("dependency.binary.node=ready")));
  assert.ok(lines.some((line) => line.includes("dependency.npm.tsx=ready")));
  assert.ok(lines.some((line) => line === "Praxis backend dependency actions: none"));
  assert.ok(lines.some((line) => line === "Praxis backend sandbox probe: not-required fallback=workspace-rollback"));
  assert.ok(lines.some((line) => line === "Praxis backend sandbox actions: none"));
});

test("buildBackendReadinessStatusLines reports local dependency probe gaps", () => {
  const lines = buildBackendReadinessStatusLines({
    now: () => "2026-05-10T00:00:00.000Z",
    localProbe: {
      nodeVersion: "v22.22.2",
      resolvePackage: () => undefined,
    },
  });

  assert.ok(lines.some((line) => line === "Praxis backend readiness: attention"));
  assert.ok(lines.some((line) => line.includes("dependency.binary.node=version-mismatch")));
  assert.ok(lines.some((line) => line.includes("dependency.npm.tsx=missing")));
  assert.ok(lines.some((line) =>
    line === "Praxis backend dependency actions: dependency.binary.node: install=manual, degrade=block-backend-start; dependency.npm.tsx: install=auto, degrade=use-built-dist-or-install"));
});

test("buildBackendReadinessStatusLines reports sandbox fallback actions", () => {
  const lines = buildBackendReadinessStatusLines({
    backendOptions: {
      sandboxProfile: "linuxBubblewrap",
    },
    now: () => "2026-05-10T00:00:00.000Z",
    localProbe: {
      nodeVersion: "v25.0.0",
      pathEnv: "/empty",
      fileExists: () => false,
      resolvePackage: (packageName) => packageName === "tsx" ? "/repo/node_modules/tsx/dist/cli.mjs" : undefined,
    },
  });

  assert.ok(lines.some((line) => line === "Praxis backend readiness: attention"));
  assert.ok(lines.some((line) => line === "Praxis backend sandbox probe: degraded fallback=workspace-rollback"));
  assert.ok(lines.some((line) =>
    line === "Praxis backend sandbox actions: profile=linux-bubblewrap, install=raxcell, fallback=workspace-rollback"));
});

test("raxodeBackendOptionsFromResolvedRole maps OpenAI chat completions config", () => {
  const options = raxodeBackendOptionsFromResolvedRole({
    roleId: "core.main",
    binding: {
      profileId: "profile.core.main",
      enabled: true,
      overrides: {
        model: "deepseek-v4-pro",
        reasoning: "minimal",
        maxOutputTokens: 1024,
      },
    },
    profile: {
      id: "profile.core.main",
      provider: "openai",
      label: "DeepSeek",
      authProfileId: "auth.openai.default",
      route: {
        baseURL: "https://api.deepseek.com",
        apiStyle: "chat/completions",
        finalRequestURL: "https://api.deepseek.com/v1/chat/completions",
      },
      model: "deepseek-v4-flash",
      enabled: true,
    },
    authProfile: {
      id: "auth.openai.default",
      provider: "openai",
      label: "OpenAI API Key",
      authMode: "api_key",
      credentials: {
        apiKey: "sk-test",
      },
      meta: {
        source: "manual",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    },
  } satisfies RaxodeResolvedRoleConfig);

  assert.deepEqual(options, {
    provider: "openai",
    endpointShape: "chat_completions",
    providerRoute: "openai_chat_completions",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    reasoningEffort: "minimal",
    maxOutputTokens: 1024,
  });
});

test("raxodeBackendOptionsFromResolvedRole maps ChatGPT Codex responses config", () => {
  const options = raxodeBackendOptionsFromResolvedRole({
    roleId: "core.main",
    binding: {
      profileId: "profile.codex",
      enabled: true,
    },
    profile: {
      id: "profile.codex",
      provider: "openai",
      label: "ChatGPT Codex",
      authProfileId: "auth.chatgpt",
      route: {
        baseURL: "https://chatgpt.com/backend-api/codex",
        apiStyle: "responses",
      },
      model: "gpt-5.5",
      reasoningEffort: "low",
      enabled: true,
    },
    authProfile: {
      id: "auth.chatgpt",
      provider: "openai",
      label: "ChatGPT OAuth",
      authMode: "chatgpt_oauth",
      credentials: {
        accessToken: "access",
        refreshToken: "refresh",
        accountId: "account",
      },
      meta: {
        source: "manual",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      },
    },
  } satisfies RaxodeResolvedRoleConfig);

  assert.equal(options.provider, "openai");
  assert.equal(options.endpointShape, "responses");
  assert.equal(options.providerRoute, "chatgpt_codex_responses");
  assert.equal(options.model, "gpt-5.5");
  assert.equal(options.reasoningEffort, "low");
});

test("resolveRaxodeLaunchPlan uses tsx and source entrypoints in dev/source mode", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-cli-source-"));
  const moduleDir = path.join(rootDir, "raxode-cli", "frontend", "tui", "cli");
  const workspaceDir = path.join(rootDir, "workspace");
  await mkdir(path.join(rootDir, "raxode-cli", "frontend", "tui", "app"), { recursive: true });
  await mkdir(path.join(rootDir, "node_modules", ".bin"), { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), "{\"name\":\"@praxis-ai/praxis\"}\n", "utf8");
  await writeFile(path.join(rootDir, "node_modules", ".bin", "tsx"), "", "utf8");
  await writeFile(path.join(rootDir, "raxode-cli", "frontend", "tui", "app", "direct-tui.tsx"), "", "utf8");

  const previousWorkspaceRoot = process.env.PRAXIS_WORKSPACE_ROOT;
  const previousInitCwd = process.env.INIT_CWD;
  delete process.env.PRAXIS_WORKSPACE_ROOT;
  delete process.env.INIT_CWD;
  try {
    const plan = resolveRaxodeLaunchPlan("tui", ["--once", "hello"], {
      cwd: workspaceDir,
      env: { TEST_ENV: "1" },
      moduleDir,
    });

    assert.equal(plan.command, path.join(rootDir, "node_modules", ".bin", "tsx"));
    assert.deepEqual(plan.args, [
      path.join(rootDir, "raxode-cli", "frontend", "tui", "app", "direct-tui.tsx"),
      "--once",
      "hello",
    ]);
    assert.equal(plan.cwd, workspaceDir);
    assert.equal(plan.env.PRAXIS_APP_ROOT, rootDir);
    assert.equal(plan.env.PRAXIS_WORKSPACE_ROOT, workspaceDir);
    assert.equal(plan.env.TEST_ENV, "1");
    assert.equal(plan.env.PRAXIS_DIRECT_SESSION_ID, undefined);
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.PRAXIS_WORKSPACE_ROOT;
    } else {
      process.env.PRAXIS_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
  }
});

test("resolveRaxodeLaunchPlan forwards sandbox profile to direct TUI backend env", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-cli-sandbox-"));
  const moduleDir = path.join(rootDir, "raxode-cli", "frontend", "tui", "cli");
  const workspaceDir = path.join(rootDir, "workspace");
  await mkdir(path.join(rootDir, "raxode-cli", "frontend", "tui", "app"), { recursive: true });
  await mkdir(path.join(rootDir, "node_modules", ".bin"), { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), "{\"name\":\"@praxis-ai/praxis\"}\n", "utf8");
  await writeFile(path.join(rootDir, "node_modules", ".bin", "tsx"), "", "utf8");
  await writeFile(path.join(rootDir, "raxode-cli", "frontend", "tui", "app", "direct-tui.tsx"), "", "utf8");

  const previousWorkspaceRoot = process.env.PRAXIS_WORKSPACE_ROOT;
  const previousInitCwd = process.env.INIT_CWD;
  delete process.env.PRAXIS_WORKSPACE_ROOT;
  delete process.env.INIT_CWD;
  try {
    const plan = resolveRaxodeLaunchPlan("tui", ["--sandbox=linuxBubblewrap"], {
      cwd: workspaceDir,
      moduleDir,
    });

    assert.deepEqual(plan.args, [
      path.join(rootDir, "raxode-cli", "frontend", "tui", "app", "direct-tui.tsx"),
      "--sandbox=linuxBubblewrap",
    ]);
    assert.equal(plan.env.RAXODE_APPLICATION_SANDBOX_PROFILE, "linuxBubblewrap");
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.PRAXIS_WORKSPACE_ROOT;
    } else {
      process.env.PRAXIS_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("resolveRaxodeLaunchPlan uses node and dist entrypoints in compiled mode", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-cli-dist-"));
  const moduleDir = path.join(rootDir, "dist", "raxode-cli", "frontend", "tui", "cli");
  const workspaceDir = path.join(rootDir, "workspace");
  await mkdir(path.join(rootDir, "dist", "raxode-cli", "frontend", "tui", "app"), { recursive: true });
  await mkdir(workspaceDir, { recursive: true });
  await writeFile(path.join(rootDir, "package.json"), "{\"name\":\"@praxis-ai/raxode\"}\n", "utf8");
  await writeFile(path.join(rootDir, "dist", "raxode-cli", "frontend", "tui", "app", "direct-tui.js"), "", "utf8");

  const previousWorkspaceRoot = process.env.PRAXIS_WORKSPACE_ROOT;
  const previousInitCwd = process.env.INIT_CWD;
  delete process.env.PRAXIS_WORKSPACE_ROOT;
  delete process.env.INIT_CWD;
  try {
    const plan = resolveRaxodeLaunchPlan("tui", ["--ui=direct"], {
      cwd: workspaceDir,
      moduleDir,
    });

    assert.equal(plan.command, process.execPath);
    assert.deepEqual(plan.args, [
      path.join(rootDir, "dist", "raxode-cli", "frontend", "tui", "app", "direct-tui.js"),
      "--ui=direct",
    ]);
    assert.equal(plan.cwd, workspaceDir);
    assert.equal(plan.env.PRAXIS_APP_ROOT, rootDir);
    assert.equal(plan.env.PRAXIS_WORKSPACE_ROOT, workspaceDir);
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.PRAXIS_WORKSPACE_ROOT;
    } else {
      process.env.PRAXIS_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
  }
});

test("hasConfiguredPrimaryModelAuth is false when the primary config is incomplete but ignores missing embedding config", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-cli-auth-"));
  const previousHome = process.env.RAXODE_HOME;
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  try {
    ensureRaxodeHomeScaffold(rootDir);
    assert.equal(hasConfiguredPrimaryModelAuth(), false);
  } finally {
    if (previousHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousHome;
    }
  }
});

test("hasConfiguredPrimaryModelAuth is true when the core OpenAI route is configured", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "praxis-raxode-cli-auth-configured-"));
  const previousHome = process.env.RAXODE_HOME;
  process.env.RAXODE_HOME = path.join(rootDir, ".raxode");
  try {
    ensureRaxodeHomeScaffold(rootDir);
    const authPath = path.join(process.env.RAXODE_HOME!, "auth.json");
    const configPath = path.join(process.env.RAXODE_HOME!, "config.json");
    const auth = JSON.parse(await readFile(authPath, "utf8")) as {
      authProfiles: Array<{ id: string; credentials: { apiKey?: string } }>;
    };
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      profiles: Array<{ id: string; route: { baseURL: string }; model: string }>;
    };
    for (const profile of auth.authProfiles) {
      if (profile.id === "auth.openai.default") {
        profile.credentials.apiKey = "sk-test-openai";
      }
    }
    const coreProfile = config.profiles.find((entry) => entry.id === "profile.core.main");
    assert.ok(coreProfile);
    coreProfile.route.baseURL = "https://api.example.com/v1";
    coreProfile.model = "gpt-5.4";
    await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`, "utf8");
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    assert.equal(hasConfiguredPrimaryModelAuth(), true);
  } finally {
    if (previousHome === undefined) {
      delete process.env.RAXODE_HOME;
    } else {
      process.env.RAXODE_HOME = previousHome;
    }
  }
});
