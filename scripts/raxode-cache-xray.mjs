#!/usr/bin/env node

import { readFileSync } from "node:fs";

const logPath = process.argv[2];
if (!logPath) {
  console.error("Usage: node scripts/raxode-cache-xray.mjs <legacy-direct-application-log.jsonl>");
  process.exit(1);
}

const rows = readFileSync(logPath, "utf8")
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Failed to parse ${logPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

const modelRows = rows.filter((row) =>
  row?.event === "stage_end" &&
  row?.stage === "core/model.infer" &&
  row?.cacheDebug?.kind === "praxis.modelCall.cacheDebug");

if (modelRows.length === 0) {
  console.error("No cacheDebug model rows found. Re-run raxode after the cache x-ray telemetry patch.");
  process.exit(2);
}

let totalInput = 0;
let totalCached = 0;

for (const [index, row] of modelRows.entries()) {
  const usage = row.usage ?? {};
  const cacheDebug = row.cacheDebug;
  const promptPack = cacheDebug.promptPack ?? {};
  const providerBody = cacheDebug.providerBody ?? {};
  const inputTokens = Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0;
  const cachedInputTokens = Number.isFinite(usage.cachedInputTokens) ? usage.cachedInputTokens : 0;
  totalInput += inputTokens;
  totalCached += cachedInputTokens;
  const hitRate = inputTokens > 0 ? Math.round((cachedInputTokens / inputTokens) * 100) : 0;
  console.log(`\n# model call ${index + 1}`);
  console.log(`usage: input=${inputTokens} cached=${cachedInputTokens} hit=${hitRate}% output=${usage.outputTokens ?? "?"} thinking=${usage.thinkingTokens ?? "?"}`);
  console.log(`provider body: total~${providerBody.estimatedTokens ?? "?"} input~${providerBody.inputEstimatedTokens ?? "?"} tools~${providerBody.toolsEstimatedTokens ?? "?"} toolCount=${providerBody.toolCount ?? "?"} previousItems=${providerBody.previousProviderOutputItems ?? "?"} toolResults=${providerBody.toolResultInputs ?? "?"}`);
  const fingerprints = providerBody.fingerprints && typeof providerBody.fingerprints === "object" ? providerBody.fingerprints : {};
  if (Object.keys(fingerprints).length > 0) {
    console.log(`provider hashes: body=${String(fingerprints.bodyHash ?? "").slice(0, 12)} tools=${String(fingerprints.toolsHash ?? "").slice(0, 12)} input=${String(fingerprints.inputHash ?? "").slice(0, 12)} developer=${String(fingerprints.developerHash ?? "").slice(0, 12)} promptPack=${String(fingerprints.promptPackUserHash ?? "").slice(0, 12)} previous=${String(fingerprints.previousItemsHash ?? "").slice(0, 12)} toolResults=${String(fingerprints.toolResultsHash ?? "").slice(0, 12)}`);
  }
  console.log(`promptPack: total~${promptPack.totalEstimatedTokens ?? "?"} rendered~${promptPack.renderedTextEstimatedTokens ?? "?"} prefix~${promptPack.cacheablePrefixEstimatedTokens ?? "?"} dynamic~${promptPack.dynamicEstimatedTokens ?? "?"}`);
  const segments = Array.isArray(promptPack.segments) ? promptPack.segments : [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") continue;
    const internalHash = segment.providerHints && typeof segment.providerHints === "object"
      ? segment.providerHints.internalStateHash
      : undefined;
    console.log(`  - ${segment.segmentKind}: ${segment.estimatedTokens ?? "?"} tokens ${segment.cachePolicy ?? "?"} hash=${String(segment.segmentHash ?? "").slice(0, 12)} internal=${String(internalHash ?? "").slice(0, 12)} materials=${segment.materialCount ?? "?"}`);
  }
  const warnings = Array.isArray(promptPack.cacheRiskWarnings) ? promptPack.cacheRiskWarnings : [];
  if (warnings.length > 0) {
    console.log(`warnings: ${warnings.join(", ")}`);
  }
}

const weightedHitRate = totalInput > 0 ? Math.round((totalCached / totalInput) * 100) : 0;
console.log(`\nweighted cache hit: ${weightedHitRate}% (${totalCached}/${totalInput})`);
