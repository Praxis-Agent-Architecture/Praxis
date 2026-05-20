export const mpBridgeContract = {
  bridgeId: "memory.example.fullstack.mpBridge",
  status: "contract-only",
  purpose: "未来接入 memory_managementPool / LanceDB；当前只声明记忆材料如何回到 PromptPack。",
  stores: ["episodic", "semantic", "artifactIndex"],
  outputs: ["memoryMaterialRefs", "retrievalRefs"],
} as const;
