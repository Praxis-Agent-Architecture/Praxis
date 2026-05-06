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
  return `${JSON.stringify({
    name: options.projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      inspect: "rax inspect agents/mainAgent.ts",
      test: "rax test agents/mainAgent.ts",
      run: "rax run agents/mainAgent.ts",
      typecheck: "tsc -p tsconfig.json --noEmit",
    },
    dependencies: {
      "@praxis-ai/framework": "^0.1.0",
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
      "agents/**/*.ts",
      "config/**/*.ts",
      "interfaces/**/*.ts",
      "policies/**/*.ts",
      "run/**/*.ts",
      "sandbox/**/*.ts",
      "state/**/*.ts",
      "storage/**/*.ts",
      "tests/**/*.ts",
      "tools/**/*.ts",
    ],
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
  return `import { praxis } from "@praxis-ai/framework";

class MainPrompt extends praxis.PromptPack {
  promptPackId = "prompt.${options.projectName}.main";
  base = praxis.markdownFile("prompts/main.md", "prompt.main");
  patches = [
    praxis.append("prompt.main", praxis.markdownFile("prompts/rules.md", "prompt.rules")),
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
  return `import { praxis } from "@praxis-ai/framework";
import Agent from "../agents/mainAgent.js";

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
        "agents",
        "config",
        "prompts",
        "policies",
        "sandbox",
        "tools",
        "storage",
        "sessions",
        "state",
        "interfaces",
        "reports",
        "tests",
        "run",
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
    { path: "tsconfig.json", content: tsconfigJson() },
    { path: "agents/mainAgent.ts", content: agentSource(options) },
    { path: "prompts/main.md", content: markdown("Main Prompt", "你是一个 Praxis Agent。先理解任务，再用已挂载工具完成工作。") },
    { path: "prompts/rules.md", content: markdown("Rules", "- 所有工具调用都必须经过 runtime governance。\n- 需要审批时，走 interface surface。") },
    { path: "run/runAgent.ts", content: runSource() },
    { path: ".gitignore", content: "node_modules/\ndist/\n.rax_workspace/\n" },
    { path: "README.md", content: markdown(options.projectName, "Run `npm run inspect`, `npm run test`, or `npm run run -- \"your task\"`.") },
  ];

  if (options.preset !== "minimal") {
    files.push(
      { path: "config/modelFleet.ts", content: "import { praxis } from \"@praxis-ai/framework\";\n\nexport const modelFleet = praxis.modelFleet.auto({\n  primary: praxis.endpoint(\"/v1/responses\", { role: \"reasoning\", provider: \"openai\", model: \"gpt-5.4\" }),\n});\n" },
      { path: "policies/toolPolicy.ts", content: `import { praxis } from "@praxis-ai/framework";\n\nexport const toolPolicy = praxis.toolPolicies.${options.toolPolicyProfile}();\n` },
      { path: "sandbox/profile.ts", content: `import { praxis } from "@praxis-ai/framework";\n\nexport const sandboxProfile = praxis.sandbox.${options.sandboxProfile}();\n` },
      { path: "tools/toolSet.ts", content: "import { praxis } from \"@praxis-ai/framework\";\n\nexport const repoToolSet = praxis.tools([\n  praxis.baseTools.code.read(),\n  praxis.baseTools.code.searchRipgrep(),\n  ...praxis.toolSets.git.inspection(),\n]);\n" },
      { path: "storage/storagePolicy.ts", content: "import { praxis } from \"@praxis-ai/framework\";\n\nexport const storagePolicy = praxis.storage.raxWorkspace();\nexport const sessionPolicy = praxis.session({ persistence: \"sqlite\", resume: \"auto\", thread: \"durable\", logs: \"full\" });\n" },
      { path: "state/statePlane.ts", content: "import { praxis } from \"@praxis-ai/framework\";\n\nexport const statePlanePolicy = praxis.statePlane({\n  expose: [\"phase\", \"lastAction\", \"toolCalls\", \"errors\", \"approvals\"],\n  control: [\"pause\", \"resume\", \"interrupt\", \"approve\", \"deny\", \"rollback\", \"inspect\", \"repair\", \"configure\"],\n  audit: \"full\",\n});\n" },
      { path: "reports/.gitkeep", content: "" },
      { path: "tests/mainAgent.test.ts", content: "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { praxis } from \"@praxis-ai/framework\";\nimport Agent from \"../agents/mainAgent.js\";\n\ntest(\"agent compiles\", () => {\n  const result = praxis.compileAgent(Agent);\n  assert.equal(result.ok, true);\n});\n" },
    );
    if (options.includeInterfaceSurface) {
      files.push({
        path: "interfaces/interfaceSurface.md",
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
