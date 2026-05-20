import { praxis } from "@praxis-ai/praxis";
import Agent from "../agents/mainAgent.js";

const compiled = praxis.compileAgent(Agent);
if (!compiled.ok) {
  console.error(compiled.error.message);
  process.exit(1);
}

const runtime = praxis.runtime.createPraxisRuntimeKernel({ runtimeId: "runtime.local" });
const result = await runtime.runManifest(compiled.manifest, process.argv.slice(2).join(" ") || "Inspect this Praxis agent project.");
console.log(JSON.stringify(result, null, 2));
