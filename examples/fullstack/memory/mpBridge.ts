export const mpBridgeContract = {
  bridgeId: "memory.example.fullstack.mpBridge.contract",
  status: "contract-only",
  purpose: "声明 application 如何按需请求记忆材料；不引入独立后台 memory agent。",
  inputs: ["task", "session", "state", "toolObservations"],
  outputs: ["memoryRefs", "retrievalRefs"],
} as const;
