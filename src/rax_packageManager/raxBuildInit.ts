/*
 * 文件定位：rax 包管理/开发者命令层 / build init 脚手架。
 * 核心目的：生成 Praxis agent 工程，让开发者从 minimal/fullstack/custom 入口开始写 Agent。
 * 边界：只写本地工程文件，不做远程 package install，不实现 marketplace。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type RaxBuildInitPreset = "minimal" | "fullstack" | "custom";

export type RaxBuildInitOptions = {
  preset: RaxBuildInitPreset;
  projectName: string;
  targetDir: string;
  agentId?: string;
  modelName?: string;
  sandboxProfile?: "hostObserved" | "workspaceOnly" | "linuxBubblewrap" | "rootlessContainer";
  toolPolicyProfile?: "standard" | "permissive" | "restricted" | "yolo" | "bapr";
  includeGitTools?: boolean;
  includeShellTools?: boolean;
  includeInterfaceSurface?: boolean;
  sessionPersistence?: "memory" | "sqlite";
};

export type RaxBuildInitFile = {
  path: string;
  content: string;
};

export type RaxBuildInitPlan = {
  preset: RaxBuildInitPreset;
  projectName: string;
  targetDir: string;
  files: readonly RaxBuildInitFile[];
  directories: readonly string[];
  nextCommands: readonly string[];
};

export type RaxBuildInitResult =
  | { ok: true; plan: RaxBuildInitPlan; writtenFiles: readonly string[]; events: readonly string[] }
  | {
      ok: false;
      error: {
        code: "MISSING_PROJECT_NAME" | "MISSING_TARGET_DIR" | "WRITE_FAILED";
        message: string;
        publicSafe: true;
      };
      events: readonly string[];
    };

function slug(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function agentClassName(projectName: string): string {
  const words = slug(projectName).split(/[-_]+/).filter(Boolean);
  const name = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
  return `${name || "Praxis"}Agent`;
}

function normalizedOptions(input: RaxBuildInitOptions): Required<RaxBuildInitOptions> {
  const projectName = slug(input.projectName) || "praxis-agent";
  return {
    preset: input.preset,
    projectName,
    targetDir: input.targetDir,
    agentId: input.agentId?.trim() || `agent.${projectName}`,
    modelName: input.modelName?.trim() || "gpt-5.4",
    sandboxProfile: input.sandboxProfile ?? "hostObserved",
    toolPolicyProfile: input.toolPolicyProfile ?? "standard",
    includeGitTools: input.includeGitTools ?? true,
    includeShellTools: input.includeShellTools ?? input.preset !== "minimal",
    includeInterfaceSurface: input.includeInterfaceSurface ?? input.preset !== "minimal",
    sessionPersistence: input.sessionPersistence ?? (input.preset === "minimal" ? "memory" : "sqlite"),
  };
}

function packageJson(options: Required<RaxBuildInitOptions>): string {
  const agentInput = options.preset === "minimal" ? "agents/mainAgent.ts" : ".";
  return `${JSON.stringify({
    name: options.projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      inspect: `rax inspect ${agentInput}`,
      test: `rax test ${agentInput}`,
      run: `rax run ${agentInput}`,
      typecheck: "tsc -p tsconfig.json --noEmit",
    },
    dependencies: {
      "@praxis-ai/praxis": "^0.1.0",
    },
    devDependencies: {
      typescript: "^5.9.3",
      tsx: "^4.21.0",
    },
  }, null, 2)}\n`;
}

function tsconfigJson(): string {
  return `${JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: true,
      types: ["node"],
    },
    include: [
      "application/**/*.ts",
      "agents/**/*.ts",
      "authentication/**/*.ts",
      "context/**/*.ts",
      "memory/**/*.ts",
      "tests/**/*.ts",
      "topology/**/*.ts",
    ],
  }, null, 2)}\n`;
}

function raxProjectJson(options: Required<RaxBuildInitOptions>): string {
  const fullstack = options.preset !== "minimal";
  return `${JSON.stringify({
    schema: "praxis.rax.project.v1",
    kind: fullstack ? "application-project" : "agent-project",
    id: options.projectName,
    entry: fullstack ? "agents/mainAgent/praxis.agent.ts" : "agents/mainAgent.ts",
    export: "default",
    agent: {
      id: options.agentId,
    },
    paths: {
      ...(fullstack ? {
        application: "application",
        authentication: "authentication",
        context: "context",
        memory: "memory",
        topology: "topology",
        tests: "tests",
        primaryAgent: "agents/mainAgent",
      } : {}),
      agents: "agents",
    },
  }, null, 2)}\n`;
}

function sandboxCall(profile: Required<RaxBuildInitOptions>["sandboxProfile"]): string {
  if (profile === "workspaceOnly") return "praxis.sandbox.workspaceOnly()";
  if (profile === "linuxBubblewrap") return "praxis.sandbox.linuxBubblewrap()";
  if (profile === "rootlessContainer") return "praxis.sandbox.rootlessContainer()";
  return "praxis.sandbox.hostObserved()";
}

function toolsBlock(options: Required<RaxBuildInitOptions>): string {
  const lines = ["praxis.baseTools.code.read()", "praxis.baseTools.code.searchRipgrep()"];
  if (options.includeGitTools) lines.push("...praxis.toolSets.git.inspection()");
  if (options.includeShellTools) lines.push("praxis.baseTools.shell.commandExecution()");
  return lines.map((line) => `      ${line},`).join("\n");
}

function agentSource(options: Required<RaxBuildInitOptions>): string {
  const className = agentClassName(options.projectName);
  const promptRoot = options.preset === "minimal" ? "prompts" : "agents/mainAgent/prompts";
  return `import { praxis } from "@praxis-ai/praxis";

class MainPrompt extends praxis.PromptPack {
  promptPackId = "prompt.${options.projectName}.main";
  base = praxis.markdownFile("${promptRoot}/main.md", "prompt.main");
  patches = [
    praxis.append("prompt.main", praxis.markdownFile("${promptRoot}/rules.md", "prompt.rules")),
  ];
}

export default class ${className} extends praxis.AgentArchetype {
  identity = { id: "${options.agentId}", version: "0.1.0" };
  model = praxis.model("${options.modelName}");
  promptPack = new MainPrompt();
  mainLoop = praxis.mainLoop.standard({
    buildPromptRef: "mainLoop.prompt.default",
    chooseModelRef: "mainLoop.model.primary",
    beforeToolRef: "mainLoop.tool.before",
    afterToolRef: "mainLoop.tool.after",
    onApprovalRef: "mainLoop.approval.route",
    onErrorRef: "mainLoop.error.report",
    onResumeRef: "mainLoop.resume.session",
  });
  sandbox = ${sandboxCall(options.sandboxProfile)};
  toolPolicy = praxis.toolPolicies.${options.toolPolicyProfile}();
  storage = praxis.storage.raxWorkspace();
  session = praxis.session({ persistence: "${options.sessionPersistence}", resume: "auto", thread: "durable", logs: "full" });
  statePlane = praxis.statePlane({
    expose: ["phase", "lastAction", "toolCalls", "errors", "approvals"],
    control: ["pause", "resume", "interrupt", "approve", "deny", "rollback", "inspect", "repair"],
    audit: "full",
  });
  harness = praxis.harness({
    tools: praxis.tools([
${toolsBlock(options)}
    ]),
    loop: praxis.loop.standard({ maxModelTurns: 4, maxToolCalls: 8 }),
    policy: praxis.policy({ allowProviderCall: true, allowToolExecution: true }),
  });
}
`;
}

function runSource(): string {
  return `import { praxis } from "@praxis-ai/praxis";
import Agent from "../agents/mainAgent/praxis.agent.js";

const compiled = praxis.compileAgent(Agent);
if (!compiled.ok) {
  console.error(compiled.error.message);
  process.exit(1);
}

const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: "runtime.local" });
const result = await runtime.runManifest(compiled.manifest, process.argv.slice(2).join(" ") || "Inspect this Praxis agent project.");
console.log(JSON.stringify(result, null, 2));
`;
}

function markdown(title: string, body: string): string {
  return `# ${title}\n\n${body.trim()}\n`;
}

export function createRaxBuildInitPlan(input: RaxBuildInitOptions): RaxBuildInitPlan {
  const options = normalizedOptions(input);
  const dirs = options.preset === "minimal"
    ? ["agents", "prompts", "run", ".rax_workspace"]
    : [
        "application",
        "agents/mainAgent/config",
        "agents/mainAgent/prompts",
        "agents/mainAgent/policies",
        "agents/mainAgent/sandbox",
        "agents/mainAgent/tools",
        "agents/mainAgent/storage",
        "agents/mainAgent/state",
        "agents/mainAgent/interfaces",
        "agents/mainAgent/harness",
        "agents/mainAgent/mainLoop",
        "authentication",
        "context",
        "memory",
        "topology",
        "tests",
        "reports",
        ".rax_workspace/sessions",
        ".rax_workspace/state",
        ".rax_workspace/events",
        ".rax_workspace/approvals",
        ".rax_workspace/artifacts",
        ".rax_workspace/cache",
        ".rax_workspace/sandbox",
      ];

  const files: RaxBuildInitFile[] = [
    { path: "package.json", content: packageJson(options) },
    { path: "rax.project.json", content: raxProjectJson(options) },
    { path: "tsconfig.json", content: tsconfigJson() },
    { path: options.preset === "minimal" ? "agents/mainAgent.ts" : "agents/mainAgent/agent.ts", content: agentSource(options) },
    ...(options.preset === "minimal" ? [] : [{ path: "agents/mainAgent/praxis.agent.ts", content: "import Agent from \"./agent.js\";\n\nexport default Agent;\n" }]),
    { path: options.preset === "minimal" ? "prompts/main.md" : "agents/mainAgent/prompts/main.md", content: markdown("Main Prompt", "你是一个 Praxis Agent。先理解任务，再用已挂载工具完成工作。") },
    { path: options.preset === "minimal" ? "prompts/rules.md" : "agents/mainAgent/prompts/rules.md", content: markdown("Rules", "- 所有工具调用都必须经过 runtime governance。\n- 需要审批时，走 interface surface。") },
    ...(options.preset === "minimal" ? [{ path: "run/runAgent.ts", content: runSource().replace("../agents/mainAgent/praxis.agent.js", "../agents/mainAgent.js") }] : [{ path: "application/runAgent.ts", content: runSource() }]),
    { path: ".gitignore", content: "node_modules/\ndist/\n.rax_workspace/\n" },
    { path: "README.md", content: markdown(options.projectName, "Run `npm run inspect`, `npm run test`, or `npm run run -- \"your task\"`.") },
  ];

  if (options.preset !== "minimal") {
    files.push(
      { path: "application/application.ts", content: `export const application = { id: "application.${options.projectName}", primaryAgentRef: "agents/mainAgent" } as const;\n` },
      { path: "agents/mainAgent/config/modelFleet.ts", content: "import { praxis } from \"@praxis-ai/praxis\";\n\nexport const modelFleet = praxis.modelFleet.auto({\n  primary: praxis.endpoint(\"/v1/responses\", { role: \"reasoning\", provider: \"openai\", model: \"gpt-5.4\" }),\n});\n" },
      { path: "agents/mainAgent/policies/toolPolicy.ts", content: `import { praxis } from "@praxis-ai/praxis";\n\nexport const toolPolicy = praxis.toolPolicies.${options.toolPolicyProfile}();\n` },
      { path: "agents/mainAgent/sandbox/profile.ts", content: `import { praxis } from "@praxis-ai/praxis";\n\nexport const sandboxProfile = praxis.sandbox.${options.sandboxProfile}();\n` },
      { path: "agents/mainAgent/tools/toolSet.ts", content: "import { praxis } from \"@praxis-ai/praxis\";\n\nexport const repoToolSet = praxis.tools([\n  praxis.baseTools.code.read(),\n  praxis.baseTools.code.searchRipgrep(),\n  ...praxis.toolSets.git.inspection(),\n]);\n" },
      { path: "agents/mainAgent/storage/storagePolicy.ts", content: "import { praxis } from \"@praxis-ai/praxis\";\n\nexport const storagePolicy = praxis.storage.raxWorkspace();\nexport const sessionPolicy = praxis.session({ persistence: \"sqlite\", resume: \"auto\", thread: \"durable\", logs: \"full\" });\n" },
      { path: "agents/mainAgent/state/statePlane.ts", content: "import { praxis } from \"@praxis-ai/praxis\";\n\nexport const statePlanePolicy = praxis.statePlane({\n  expose: [\"phase\", \"lastAction\", \"toolCalls\", \"errors\", \"approvals\"],\n  control: [\"pause\", \"resume\", \"interrupt\", \"approve\", \"deny\", \"rollback\", \"inspect\", \"repair\", \"configure\"],\n  audit: \"full\",\n});\n" },
      { path: "authentication/providerProfiles.ts", content: "export const providerProfiles = { rawSecretsStoredHere: false, profiles: [] } as const;\n" },
      { path: "context/cmpBridge.ts", content: "export const cmpBridge = { status: \"contract-only\" } as const;\n" },
      { path: "memory/mpBridge.ts", content: "export const mpBridge = { status: \"contract-only\" } as const;\n" },
      { path: "topology/multiagentTopology.ts", content: "export const topology = { status: \"single-agent\" } as const;\n" },
      { path: "reports/.gitkeep", content: "" },
      { path: "tests/mainAgent.test.ts", content: "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { praxis } from \"@praxis-ai/praxis\";\nimport Agent from \"../agents/mainAgent/praxis.agent.js\";\n\ntest(\"agent compiles\", () => {\n  const result = praxis.compileAgent(Agent);\n  assert.equal(result.ok, true);\n});\n" },
    );
    if (options.includeInterfaceSurface) {
      files.push({
        path: "agents/mainAgent/interfaces/interfaceSurface.md",
        content: markdown("Interface Surface", "Approval、state、event、management envelope 会从这里接到 CLI/TUI/Raxode/Raxos。"),
      });
    }
  }

  return {
    preset: options.preset,
    projectName: options.projectName,
    targetDir: path.resolve(options.targetDir),
    files,
    directories: dirs,
    nextCommands: [
      `cd ${path.resolve(options.targetDir)}`,
      "npm install",
      "npm run inspect",
      "npm run test",
      "npm run run -- \"hello praxis\"",
    ],
  };
}

export async function applyRaxBuildInitPlan(plan: RaxBuildInitPlan): Promise<RaxBuildInitResult> {
  try {
    await mkdir(plan.targetDir, { recursive: true });
    for (const directory of plan.directories) {
      await mkdir(path.join(plan.targetDir, directory), { recursive: true });
    }

    const writtenFiles: string[] = [];
    for (const file of plan.files) {
      const destination = path.join(plan.targetDir, file.path);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, "utf8");
      writtenFiles.push(destination);
    }

    return {
      ok: true,
      plan,
      writtenFiles,
      events: ["rax.build.init.applied"],
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "WRITE_FAILED",
        message: error instanceof Error ? error.message : "failed to write rax scaffold",
        publicSafe: true,
      },
      events: ["rax.build.init.rejected"],
    };
  }
}

export async function initRaxProject(input: RaxBuildInitOptions): Promise<RaxBuildInitResult> {
  if (input.projectName.trim().length === 0) {
    return {
      ok: false,
      error: { code: "MISSING_PROJECT_NAME", message: "rax build init requires a project name", publicSafe: true },
      events: ["rax.build.init.rejected"],
    };
  }
  if (input.targetDir.trim().length === 0) {
    return {
      ok: false,
      error: { code: "MISSING_TARGET_DIR", message: "rax build init requires a target directory", publicSafe: true },
      events: ["rax.build.init.rejected"],
    };
  }
  return applyRaxBuildInitPlan(createRaxBuildInitPlan(input));
}
