/*
 * 文件定位：rax 开发者 CLI。
 * 核心目的：提供 rax build init / inspect / test / run 的最小真实入口。
 * 边界：不做远程 marketplace、不静默安装依赖、不绕过 agentCore public API。
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { praxis, type AgentRunResult } from "../agentCore/index.js";
import {
  createRaxBuildInitPlan,
  initRaxProject,
  type RaxBuildInitOptions,
  type RaxBuildInitPreset,
} from "./raxBuildInit.js";
import { planRaxDeveloperCommand } from "./raxDeveloperCommandContract.js";

export type RaxCliResult = {
  exitCode: number;
  output: string;
};

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function parseBoolean(value: string): boolean {
  return ["yes", "y", "true", "1", "on"].includes(value.trim().toLowerCase());
}

async function ask(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} (${defaultValue}): `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function customOptions(args: readonly string[]): Promise<RaxBuildInitOptions> {
  const projectName = argValue(args, "--name") ?? await ask("Project name", "praxis-agent");
  const targetDir = argValue(args, "--dir") ?? await ask("Target directory", projectName);
  const modelName = argValue(args, "--model") ?? await ask("Model name", "gpt-5.4");
  const sandboxProfile = (argValue(args, "--sandbox") ?? await ask("Sandbox profile hostObserved/workspaceOnly/linuxBubblewrap/rootlessContainer", "hostObserved")) as RaxBuildInitOptions["sandboxProfile"];
  const toolPolicyProfile = (argValue(args, "--tool-policy") ?? await ask("Tool policy standard/permissive/restricted/yolo/bapr", "standard")) as RaxBuildInitOptions["toolPolicyProfile"];
  const sessionPersistence = (argValue(args, "--session") ?? await ask("Session persistence memory/sqlite", "sqlite")) as RaxBuildInitOptions["sessionPersistence"];
  const includeShellTools = parseBoolean(argValue(args, "--shell-tools") ?? await ask("Include shell tools yes/no", "yes"));
  const includeGitTools = parseBoolean(argValue(args, "--git-tools") ?? await ask("Include git tools yes/no", "yes"));
  const includeInterfaceSurface = parseBoolean(argValue(args, "--interface") ?? await ask("Include interface surface yes/no", "yes"));

  return {
    preset: "custom",
    projectName,
    targetDir,
    modelName,
    sandboxProfile,
    toolPolicyProfile,
    sessionPersistence,
    includeShellTools,
    includeGitTools,
    includeInterfaceSurface,
  };
}

async function handleBuildInit(args: readonly string[]): Promise<RaxCliResult> {
  const preset = (args[0] ?? "minimal") as RaxBuildInitPreset;
  if (!["minimal", "fullstack", "custom"].includes(preset)) {
    return { exitCode: 1, output: `Unknown rax build init preset: ${preset}\n` };
  }

  const options = preset === "custom"
    ? await customOptions(args.slice(1))
    : {
        preset,
        projectName: argValue(args, "--name") ?? "praxis-agent",
        targetDir: argValue(args, "--dir") ?? argValue(args, "--name") ?? "praxis-agent",
        sandboxProfile: (argValue(args, "--sandbox") as RaxBuildInitOptions["sandboxProfile"] | undefined) ?? (preset === "fullstack" ? "linuxBubblewrap" : "hostObserved"),
        toolPolicyProfile: (argValue(args, "--tool-policy") as RaxBuildInitOptions["toolPolicyProfile"] | undefined) ?? "standard",
        sessionPersistence: (argValue(args, "--session") as RaxBuildInitOptions["sessionPersistence"] | undefined) ?? (preset === "minimal" ? "memory" : "sqlite"),
      };

  if (hasFlag(args, "--dry-run")) {
    const plan = createRaxBuildInitPlan(options);
    return { exitCode: 0, output: `${JSON.stringify(plan, null, 2)}\n` };
  }

  const result = await initRaxProject(options);
  if (!result.ok) {
    return { exitCode: 1, output: `${result.error.message}\n` };
  }

  return {
    exitCode: 0,
    output: [
      `Created Praxis ${result.plan.preset} project at ${result.plan.targetDir}`,
      `Files: ${result.writtenFiles.length}`,
      "Next:",
      ...result.plan.nextCommands.map((command) => `  ${command}`),
      "",
    ].join("\n"),
  };
}

async function loadAgentModule(agentPath: string): Promise<Record<string, unknown>> {
  const absolute = path.resolve(agentPath);
  return await import(pathToFileURL(absolute).href) as Record<string, unknown>;
}

async function compileAgentFile(agentPath: string, exportName?: string) {
  const module = await loadAgentModule(agentPath);
  if (exportName !== undefined && exportName.trim().length > 0) {
    return praxis.compileAgent(module[exportName] as never);
  }

  const candidates = [
    ["default", module.default],
    ...Object.entries(module).filter(([name]) => name !== "default"),
  ] as [string, unknown][];
  let lastFailure: ReturnType<typeof praxis.compileAgent> | undefined;
  const validAgents: { exportName: string; compiled: ReturnType<typeof praxis.compileAgent> }[] = [];
  for (const [name, candidate] of candidates) {
    const compiled = praxis.compileAgent(candidate as never);
    if (compiled.ok) {
      validAgents.push({ exportName: name, compiled });
      continue;
    }
    lastFailure = compiled;
  }

  if (validAgents.length === 1) {
    return validAgents[0].compiled;
  }

  if (validAgents.length > 1) {
    throw new Error(`multiple Praxis Agent exports found: ${validAgents.map((agent) => agent.exportName).join(", ")}. Use --export <name>.`);
  }

  return lastFailure ?? praxis.compileAgent(undefined as never);
}

function formatReadinessConsole(input: {
  command: "inspect" | "test";
  manifest: ReturnType<typeof praxis.inspectAgentManifest>;
  sandbox: Awaited<ReturnType<typeof praxis.sandboxPlane.prepareSandboxRuntime>>;
  inspection: unknown;
  runtimeDryRun?: AgentRunResult;
}): string {
  const hints = input.sandbox.probe.selfRepairHints.map((hint) => `  - ${hint.message}`).join("\n") || "  - none";
  const missing = input.sandbox.probe.missingDependencies.join(", ") || "none";
  const smoke = input.sandbox.smoke?.status ?? "not-run";
  const runtimeDryRun = input.runtimeDryRun === undefined
    ? "not-run"
    : input.runtimeDryRun.ok
      ? "passed"
      : `failed:${input.runtimeDryRun.error.code}`;
  return [
    `rax ${input.command}`,
    `agent: ${input.manifest.identityId}`,
    `sandbox: ${input.sandbox.profile} / ${input.sandbox.providerFamily}`,
    `sandbox ready: ${input.sandbox.ready}`,
    `sandbox probe: ${input.sandbox.probe.status}`,
    `sandbox smoke: ${smoke}`,
    `runtime dry-run: ${runtimeDryRun}`,
    `missing dependencies: ${missing}`,
    "self-repair hints:",
    hints,
    "",
    JSON.stringify({ inspection: input.inspection }, null, 2),
    "",
  ].join("\n");
}

function formatRunConsole(result: AgentRunResult): string {
  const common = [
    "rax run",
    `ok: ${result.ok}`,
    `runtime: ${result.runtimeId ?? "unknown"}`,
    `session: ${result.sessionId ?? "unknown"}`,
  ];

  if (result.ok) {
    return [
      ...common,
      `final output: ${result.finalOutput}`,
      `model calls: ${result.modelCalls.length}`,
      `tool calls: ${result.toolCalls.length}`,
      `events: ${result.events.length}`,
      "",
    ].join("\n");
  }

  const pendingApprovals = result.state?.approvals.filter((approval) => approval.status === "pending") ?? [];
  const repairEvents = result.state?.events
    .filter((event) => event.type === "runtime.sandboxPlane.prepared")
    .flatMap((event) => {
      const sandbox = (event.payload as { sandbox?: { probe?: { selfRepairHints?: { message?: string }[] } } }).sandbox;
      return sandbox?.probe?.selfRepairHints?.map((hint) => hint.message).filter((message): message is string => typeof message === "string") ?? [];
    }) ?? [];

  return [
    ...common,
    `error: ${result.error.code}`,
    result.error.message,
    `pending approvals: ${pendingApprovals.length}`,
    "self-repair hints:",
    ...(repairEvents.length > 0 ? repairEvents.map((hint) => `  - ${hint}`) : ["  - none"]),
    "",
  ].join("\n");
}

async function handleInspectTestRun(command: "inspect" | "test" | "run", args: readonly string[]): Promise<RaxCliResult> {
  const agentPath = args[0];
  if (agentPath === undefined || agentPath.trim().length === 0) {
    return { exitCode: 1, output: `rax ${command} requires an agent file\n` };
  }

  const exportName = argValue(args, "--export");
  const plan = planRaxDeveloperCommand({
    command,
    input: { kind: "agentFile", path: agentPath, exportName },
    cwd: process.cwd(),
    runtimeId: "runtime.rax.cli",
  });
  if (!plan.ok) {
    return { exitCode: 1, output: `${plan.error.message}\n` };
  }

  let compiled: Awaited<ReturnType<typeof compileAgentFile>>;
  try {
    compiled = await compileAgentFile(agentPath, exportName);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed to load agent file";
    const multipleExports = message.includes("multiple Praxis Agent exports found");
    return {
      exitCode: 1,
      output: [
        `rax ${command} could not load ${agentPath}`,
        message,
        "self-repair hints:",
        multipleExports
          ? "  - rerun with --export <AgentClassName>"
          : "  - run npm install in the generated agent project",
        multipleExports
          ? "  - add a default export if this file has one intended Agent"
          : "  - verify @praxis-ai/framework is installed or linked",
        "  - rerun rax inspect after the issue is fixed",
        "",
      ].join("\n"),
    };
  }
  if (!compiled.ok) {
    return { exitCode: 1, output: `${compiled.error.message}\n` };
  }

  if (command === "inspect" || command === "test") {
    const sandboxReadiness = await praxis.sandboxPlane.prepareSandboxRuntime(compiled.manifest.sandbox, {
      cwd: process.cwd(),
      runSmoke: command === "test",
    });
    const report = praxis.inspection.createFrameworkInspectionReport({
      runtimeId: "runtime.rax.cli",
      manifest: compiled.manifest,
      providers: [{ providerId: compiled.manifest.model.provider, ready: false, reason: "provider probe is deferred in CLI v0" }],
      dependencies: sandboxReadiness.probe.dependencyChecks.map((check) => ({
        dependencyId: check.dependencyId,
        owner: "runtime",
        ready: check.status === "available",
        required: check.required,
        reason: check.publicSafeMessage,
      })),
    });
    const manifestInspection = praxis.inspectAgentManifest(compiled.manifest);
    const runtimeDryRun = command === "test"
      ? await praxis.runtime.createPraxisRuntimeKernel({
          runtimeId: "runtime.rax.cli.test",
          store: praxis.runtime.createInMemorySessionStateEventStore(),
        }).runManifest(compiled.manifest, "Praxis rax test dry-run.", {
          dryRun: true,
          allowProviderCall: false,
          allowToolExecution: false,
          storage: { cwd: process.cwd(), initMode: "never" },
          sandbox: { cwd: process.cwd(), failOnUnavailable: true },
        })
      : undefined;
    const payload = {
      command,
      plan: plan.plan,
      manifest: manifestInspection,
      sandbox: sandboxReadiness,
      readiness: report.ok ? report.report : report.error,
      runtimeDryRun,
    };
    const ok = report.ok && (command === "inspect" || runtimeDryRun?.ok === true);
    return {
      exitCode: ok ? 0 : 1,
      output: hasFlag(args, "--json")
        ? `${JSON.stringify(payload, null, 2)}\n`
        : formatReadinessConsole({
            command,
            manifest: manifestInspection,
            sandbox: sandboxReadiness,
            inspection: report.ok ? report.report : report.error,
            runtimeDryRun,
          }),
    };
  }

  const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: "runtime.rax.cli" });
  const task = args.slice(1).filter((value) => !value.startsWith("--")).join(" ") || "Run this Praxis agent.";
  const result = await runtime.runManifest(compiled.manifest, task);
  return {
    exitCode: result.ok ? 0 : 1,
    output: hasFlag(args, "--json")
      ? `${JSON.stringify(result, null, 2)}\n`
      : formatRunConsole(result),
  };
}

export async function runRaxCli(argv = process.argv.slice(2)): Promise<RaxCliResult> {
  const [command, subcommand, ...rest] = argv;
  if (command === "build" && subcommand === "init") {
    return handleBuildInit(rest);
  }
  if (command === "inspect" || command === "test" || command === "run") {
    return handleInspectTestRun(command, [subcommand, ...rest].filter((value): value is string => value !== undefined));
  }
  return {
    exitCode: 1,
    output: "Usage: rax build init minimal|fullstack|custom [--dir path] [--dry-run] | rax inspect/test/run agent.ts\n",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = await runRaxCli();
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
}
