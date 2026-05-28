import { createOpenAICompatibleProvider } from "./openaiCompatible.js";

export const deepSeekProvider = createOpenAICompatibleProvider({
  id: "deepseek",
  displayName: "DeepSeek",
  baseUrl: "https://api.deepseek.com",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  models: ["deepseek-chat", "deepseek-reasoner"],
});
