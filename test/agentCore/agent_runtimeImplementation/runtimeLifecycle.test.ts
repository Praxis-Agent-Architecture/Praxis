import { defineAgentCoreContractTest } from "../agentCoreContractTestHelper.js";

defineAgentCoreContractTest({
  sourcePath: "src/agentCore/agent_runtimeImplementation/runtimeLifecycle.ts",
  docPath: "docs/agentCore/agent_runtimeImplementation/runtimeLifecycle.md",
  testFileUrl: import.meta.url,
});
