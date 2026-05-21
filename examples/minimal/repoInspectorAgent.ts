import { praxis } from "@praxis-ai/praxis";

/*
 * Minimal 目标：
 * 用最少的公开 API 写出一个能 compile、inspect、runManifest dry-run 的 Agent。
 *
 * 它故意不展示 modelFleet / 自定义 policy matrix / statePlane 扩展 / interface bridge。
 * 白话：这是“普通开发者五分钟能看懂”的写法。
 */

export class MinimalRepoPrompt extends praxis.PromptPack {
  /*
   * PromptPack 仍然独立成类。
   * 即使是 minimal，也建议把 prompt 包成可审计对象，而不是到处散落字符串。
   */
  promptPackId = "prompt.example.minimal.repoInspector";

  /*
   * minimal 使用一个 prompt package 文件作为 base。
   * 这证明最小写法也可以走专业 prompt 包，不需要长提示词嵌入 TS。
   */
  base = praxis.prompt.markdownFile("examples/minimal/repo-inspector/base.md", "minimalRepo.base");

  /*
   * 只保留一个证据规则 patch。
   * 够用，但不展示复杂场景触发和状态机变更。
   */
  patches = [
    praxis.prompt.append(
      "minimalRepo.base",
      praxis.prompt.markdownFile("examples/minimal/repo-inspector/evidence-rule.md", "minimalRepo.evidence"),
    ),
  ];

  metadata = {
    purpose: "example-minimal",
    promptPackageRoot: "examples/minimal/repo-inspector",
    providerPayloadBuiltHere: false,
  };
}

export class MinimalRepoInspectorAgent extends praxis.Agent {
  /*
   * identity：Agent 的稳定身份。
   * 后续 manifest、session、storage、云端包名都会围绕这个 id 建索引。
   */
  identity = {
    id: "agent.example.minimal.repoInspector",
    name: "Minimal Repo Inspector",
    version: "0.1.0",
    description: "最小 Praxis Agent 示例：只读观察仓库并输出证据化结论。",
  };

  /*
   * model：最小主模型声明。
   * example 默认 dry-run，不要求现在真的连 provider。
   */
  model = praxis.model("gpt-5.5", {
    provider: "openai",
    endpointShape: "responses",
    carrierId: "carrier.example.minimal.repoInspector",
  });

  /*
   * promptPack：把当前任务、规则和后续 observation 交给 runtime/promptLowering 链路。
   */
  promptPack = new MinimalRepoPrompt();

  /*
   * sandbox：minimal 默认 hostObserved。
   * 它不提供 OS 隔离，但会进入 runtime 治理、事件、审批和资源记录。
   */
  sandbox = praxis.sandbox.hostObserved({
    filesystem: "workspace-only",
    network: "deny-by-default",
    shell: "approval-for-write",
  });

  /*
   * toolPolicy：standard 是保守默认档。
   * 白话：safe 尽量放行，risky/dangerous 进入 guarded/approval 路径。
   */
  toolPolicy = praxis.toolPolicies.standard({
    matrixId: "toolPolicy.example.minimal.standard",
  });

  /*
   * storage/session：minimal 使用 memory。
   * 这样运行示例不创建 sqlite，也不会污染工作区。
   */
  storage = praxis.storage.memory();
  session = praxis.session({
    persistence: "memory",
    resume: "manual",
    thread: "ephemeral",
    logs: "summary",
  });

  /*
   * harness：最小能力外壳。
   * 挂核心只读工具，开发者不需要背 toolId 字符串。
   */
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.baseTools.code.read(),
      praxis.baseTools.code.searchRipgrep(),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "promptPack.define", "tool.execute"],
    }),
    loop: praxis.loop.standard({
      maxModelTurns: 2,
      maxToolCalls: 2,
    }),
  });
}
