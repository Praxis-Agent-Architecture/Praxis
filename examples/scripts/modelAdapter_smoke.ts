import {
  createMockTransport,
  createRaxModelClient,
  openAIProvider,
} from "../../src/modelAdapter/index.js";

const baseRoute = openAIProvider.routes[0];
if (baseRoute === undefined) {
  throw new Error("openAIProvider has no routes");
}

const client = createRaxModelClient([
  {
    ...baseRoute,
    transport: createMockTransport([
      { choices: [{ delta: { content: "modelAdapter" } }] },
      { choices: [{ delta: { content: "-ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 } },
    ]),
  },
]);

const request = {
  model: { provider: "openai", model: "gpt-5.4", route: "openai", auth: { type: "none" as const } },
  system: [{ type: "text" as const, text: "Return a compact smoke-test marker." }],
  messages: [{ role: "user" as const, content: "Say modelAdapter-ok." }],
  generation: { maxOutputTokens: 32, reasoningEffort: "low" as const },
};

const prepared = await client.prepare(request);
const response = await client.generate(request);

console.log(JSON.stringify({
  ok: response.text === "modelAdapter-ok",
  routeId: prepared.routeId,
  protocolId: prepared.protocolId,
  text: response.text,
  usage: response.usage,
}, null, 2));

