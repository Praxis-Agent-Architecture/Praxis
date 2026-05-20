import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

type AgentCoreContractTarget = {
  sourcePath: string;
  docPath: string;
  testFileUrl: string;
};

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, "../..");

const requiredDocSections = [
  "## 1. 文件位置",
  "## 2. 文件职责",
  "## 2.1 文件名语义拆解",
  "## 3. 目录语义",
  "## 4. 源码头部能力注释",
  "## 5. 需要提供的能力",
  "## 6. 输入边界",
  "## 7. 输出边界",
  "## 8. 错误边界",
  "## 9. 依赖对象",
  "## 10. 被谁调用",
  "## 11. 不应该做什么",
  "## 12. 最小实现建议",
  "## 13. 最小测试建议",
  "## 14. 与系统链路的关系",
] as const;

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function section(text: string, title: string): string {
  const start = text.indexOf(title);
  assert.notEqual(start, -1, "missing section: " + title);
  const rest = text.slice(start + title.length);
  const next = rest.search(/\n## \d+(?:\.\d+)?\. /);
  return next === -1 ? rest.trim() : rest.slice(0, next).trim();
}

function sourceHeader(sourceText: string): string {
  const match = sourceText.match(/^\/\*([\s\S]*?)\*\//);
  assert.ok(match, "source must start with a capability header comment");
  return match[1];
}

function assertRequiredPhrases(text: string, phrases: string[], context: string): void {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), context + " must mention " + JSON.stringify(phrase));
  }
}

function assertNoGenericBody(docText: string): void {
  const bodyWithoutCopiedSourceHeader = docText.replace(
    /## 4\. 源码头部能力注释[\s\S]*?## 5\. 需要提供的能力/,
    "## 5. 需要提供的能力",
  );

  assert.doesNotMatch(
    bodyWithoutCopiedSourceHeader,
    /工程含义：这是 agentCore 骨架中的一个窄能力点|当前模块上游传入|agentCore 内部相邻模块|承接 .+对应的最小运行能力/,
    "doc body must not fall back to generic placeholder language",
  );
}

function assertPathSpecificContract(sourcePath: string, docText: string): void {
  if (sourcePath.includes("/promptPack/")) {
    assertRequiredPhrases(docText, ["PromptPack", "不是最终 provider payload", "CMP", "promptLoweringRuntime"], "promptPack contract");
  }

  if (sourcePath.includes("/basic_toolLayer/baseTools/")) {
    assertRequiredPhrases(docText, ["基础工具原语", "TAP", "高级工具"], "baseTools contract");
  }

  if (sourcePath.includes("/TAP_reuseTransferModule/")) {
    assertRequiredPhrases(docText, ["TAP", "复用转交", "基础工具"], "TAP reuse transfer contract");
  }

  if (sourcePath.includes("/actualInvocationLayer/")) {
    assertRequiredPhrases(docText, ["actualInvocationLayer", "provider"], "actual invocation contract");
    assert.match(docText, /provider 原始字段|provider 字段形状|provider 的字段形状/, "provider details must stay below agentCore public contract");
  }

  if (sourcePath.includes("/actualInvocationLayer/customFormat/")) {
    assertRequiredPhrases(docText, ["自定义格式", "Praxis 标准"], "custom format contract");
  }

  if (sourcePath.includes("/agentCore_interfaceAdapter/")) {
    assertRequiredPhrases(docText, ["接口", "runtime", "治理"], "interface adapter contract");
  }

  if (sourcePath.includes("/agentCore_runtimeImplementation/")) {
    assertRequiredPhrases(docText, ["runtime", "治理", "契约"], "runtime implementation contract");
  }

  if (sourcePath.includes("/runtime.governancePlane/")) {
    assertRequiredPhrases(docText, ["治理", "权限", "审计"], "governance plane contract");
  }

  if (sourcePath.includes("/runtime.contractSurface/")) {
    assertRequiredPhrases(docText, ["契约", "类型", "接口"], "contract surface contract");
  }

  if (sourcePath.includes("/runtime.invocationMethod/")) {
    assertRequiredPhrases(docText, ["调用", "入口", "结果"], "invocation method contract");
  }

  if (sourcePath.includes("/coreLogic/eventExposurePlane/")) {
    assertRequiredPhrases(docText, ["事件", "暴露", "订阅"], "event exposure contract");
  }
}

export function defineAgentCoreContractTest(target: AgentCoreContractTarget): void {
  const testPath = path.relative(repoRoot, fileURLToPath(target.testFileUrl)).split(path.sep).join("/");
  const sourcePath = target.sourcePath;
  const docPath = target.docPath;
  const label = sourcePath.replace("src/agentCore/", "agentCore/");

  test(label + " follows its source and documentation contract", () => {
    assert.ok(existsSync(path.join(repoRoot, sourcePath)), "missing source: " + sourcePath);
    assert.ok(existsSync(path.join(repoRoot, docPath)), "missing doc: " + docPath);
    assert.ok(testPath.endsWith(".test.ts"), "test file must use .test.ts suffix");

    const sourceText = readWorkspaceFile(sourcePath);
    const docText = readWorkspaceFile(docPath);
    const header = sourceHeader(sourceText);

    assertRequiredPhrases(header, ["文件定位：", "核心目的：", "边界：", "对接：", "实现提示："], "source header");

    const sourceReference = "对应源码：" + String.fromCharCode(96) + sourcePath + String.fromCharCode(96);
    assert.ok(docText.includes(sourceReference), "doc must point back to the exact source file");

    for (const requiredSection of requiredDocSections) {
      assert.ok(docText.includes(requiredSection), "doc must contain " + requiredSection);
    }

    const sourceHeaderLines = header
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .filter(Boolean);
    for (const line of sourceHeaderLines) {
      assert.ok(docText.includes(line), "doc must preserve source header line: " + line);
    }

    const responsibility = section(docText, "## 2. 文件职责");
    const ability = section(docText, "## 5. 需要提供的能力");
    const inputBoundary = section(docText, "## 6. 输入边界");
    const outputBoundary = section(docText, "## 7. 输出边界");
    const errorBoundary = section(docText, "## 8. 错误边界");
    const dependencies = section(docText, "## 9. 依赖对象");
    const callers = section(docText, "## 10. 被谁调用");
    const minimumImplementation = section(docText, "## 12. 最小实现建议");
    const minimumTests = section(docText, "## 13. 最小测试建议");

    for (const [name, content] of [
      ["responsibility", responsibility],
      ["ability", ability],
      ["input boundary", inputBoundary],
      ["output boundary", outputBoundary],
      ["error boundary", errorBoundary],
      ["dependencies", dependencies],
      ["callers", callers],
      ["minimum implementation", minimumImplementation],
      ["minimum tests", minimumTests],
    ] as const) {
      assert.ok(content.includes("- ") || content.length > 24, name + " section must be actionable");
    }

    assertNoGenericBody(docText);
    assertPathSpecificContract(sourcePath, docText);
  });
}
