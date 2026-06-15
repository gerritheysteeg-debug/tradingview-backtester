import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCandles,
  getCurrencies,
  getInstruments,
  SUPPORTED_RESOLUTIONS
} from "./deribit.mjs";
import {
  getStrategy,
  listStrategies,
  runStrategyBacktest,
  scanStrategy
} from "../public/shared/strategyRegistry.mjs";
import { makeRegimeDecision } from "../public/shared/decisionEngine.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = normalize(join(__dirname, "..", "public"));
const port = Number(process.env.PORT ?? 5173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function parseQuery(request) {
  return new URL(request.url, `http://${request.headers.host}`);
}

function nowMs() {
  return Date.now();
}

function cartesianProduct(grid) {
  const keys = Object.keys(grid).filter(k => Array.isArray(grid[k]) && grid[k].length > 0);
  if (!keys.length) return [{}];
  const [first, ...rest] = keys;
  const restProduct = cartesianProduct(Object.fromEntries(rest.map(k => [k, grid[k]])));
  return grid[first].flatMap(val => restProduct.map(combo => ({ [first]: val, ...combo })));
}

async function handleApi(request, response) {
  const url = parseQuery(request);

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      provider: "Deribit",
      supportedResolutions: SUPPORTED_RESOLUTIONS,
      strategies: listStrategies()
    });
    return;
  }

  if (url.pathname === "/api/strategies") {
    sendJson(response, 200, { strategies: listStrategies() });
    return;
  }

  if (url.pathname === "/api/instruments") {
    const currency = url.searchParams.get("currency") ?? "BTC";
    const kind = url.searchParams.get("kind") ?? "future";
    const instruments = await getInstruments(currency, kind);
    sendJson(response, 200, { instruments });
    return;
  }

  if (url.pathname === "/api/currencies") {
    const currencies = await getCurrencies();
    sendJson(response, 200, { currencies });
    return;
  }

  if (url.pathname === "/api/candles") {
    const instrumentName = url.searchParams.get("instrument") ?? "BTC-PERPETUAL";
    const resolution = url.searchParams.get("resolution") ?? "15m";
    const lookbackDays = Number(url.searchParams.get("lookbackDays") ?? 30);
    const endTimestamp = nowMs();
    const startTimestamp = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const candles = await getCandles({
      instrumentName,
      resolution,
      startTimestamp,
      endTimestamp
    });
    sendJson(response, 200, { candles });
    return;
  }

  if (url.pathname === "/api/backtest" && request.method === "POST") {
    const body = await readJsonRequest(request);
    const instrumentName = body.instrumentName ?? "BTC-PERPETUAL";
    const strategyId = body.strategyId ?? "support-resistance-v1";
    const strategy = getStrategy(strategyId);
    if (!strategy) {
      sendJson(response, 400, { error: `Onbekende strategie: ${strategyId}` });
      return;
    }
    const entryResolution =
      strategy.chartResolution ?? body.entryResolution ?? "15m";
    const levelResolution =
      strategy.levelResolution ?? body.levelResolution ?? "4h";
    const rawLookback = Number(body.lookbackDays ?? 90);
    const lookbackDays = Number.isFinite(rawLookback) && rawLookback > 0 ? rawLookback : 90;
    const endTimestamp = nowMs();
    const startTimestamp = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const requiredResolutions = strategy.requiredResolutions?.length
      ? strategy.requiredResolutions
      : [entryResolution, levelResolution];
    const uniqueResolutions = [...new Set(requiredResolutions)];
    const candlesByResolution = Object.fromEntries(
      (await Promise.allSettled(
        uniqueResolutions.map(async (resolution) => [
          resolution,
          await getCandles({ instrumentName, resolution, startTimestamp, endTimestamp })
        ])
      ))
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
    );

    const entryCandles = candlesByResolution[entryResolution] ?? [];
    const levelCandles = candlesByResolution[levelResolution] ?? [];

    const result = runStrategyBacktest({
      strategyId,
      entryCandles,
      levelCandles,
      candlesByResolution,
      options: body.options ?? {}
    });

    sendJson(response, 200, {
      instrumentName,
      strategyId,
      entryResolution,
      levelResolution,
      lookbackDays,
      entryCandles,
      levelCandles,
      ...result
    });
    return;
  }

  if (url.pathname === "/api/next-entry" && request.method === "GET") {
    const instrumentName = url.searchParams.get("instrument") ?? "BTC-PERPETUAL";
    const strategyId = url.searchParams.get("strategy") ?? "support-resistance-v1";
    const rawLookback = Number(url.searchParams.get("lookbackDays") ?? 90);
    const lookbackDays = Number.isFinite(rawLookback) && rawLookback > 0 ? rawLookback : 90;
    let options = {};
    try { options = JSON.parse(url.searchParams.get("options") ?? "{}"); } catch {}

    const strategy = getStrategy(strategyId);
    if (!strategy) {
      sendJson(response, 400, { error: `Onbekende strategie: ${strategyId}` });
      return;
    }

    const entryResolution = strategy.chartResolution ?? url.searchParams.get("entryResolution") ?? "15m";
    const levelResolution = strategy.levelResolution ?? url.searchParams.get("levelResolution") ?? "4h";
    const endTimestamp = nowMs();
    const startTimestamp = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const requiredResolutions = strategy.requiredResolutions?.length
      ? strategy.requiredResolutions
      : [...new Set([entryResolution, levelResolution])];

    const candlesByResolution = Object.fromEntries(
      (await Promise.allSettled(
        requiredResolutions.map(async (resolution) => [
          resolution,
          await getCandles({ instrumentName, resolution, startTimestamp, endTimestamp })
        ])
      ))
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
    );

    const entryCandles = candlesByResolution[entryResolution] ?? [];
    const levelCandles = candlesByResolution[levelResolution] ?? [];

    const result = scanStrategy({ strategyId, entryCandles, levelCandles, candlesByResolution, options });
    sendJson(response, 200, { instrumentName, strategyId, updatedAt: Date.now(), ...result });
    return;
  }

  if (url.pathname === "/api/regime-decision" && request.method === "GET") {
    const instrumentName = url.searchParams.get("instrument") ?? "BTC-PERPETUAL";
    const rawLookback    = Number(url.searchParams.get("lookbackDays") ?? 90);
    const lookbackDays   = Number.isFinite(rawLookback) && rawLookback > 0 ? rawLookback : 90;
    let options = {};
    try { options = JSON.parse(url.searchParams.get("options") ?? "{}"); } catch {}

    const endTimestamp   = nowMs();
    const startTimestamp = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const requiredResolutions = ["1W", "1D", "4h", "15m", "3m"];

    const candlesByResolution = Object.fromEntries(
      (await Promise.allSettled(
        requiredResolutions.map(async (resolution) => [
          resolution,
          await getCandles({ instrumentName, resolution, startTimestamp, endTimestamp })
        ])
      ))
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
    );

    const entryCandles = candlesByResolution["3m"] ?? [];
    const levelCandles = candlesByResolution["4h"] ?? [];

    const decision = makeRegimeDecision({ entryCandles, levelCandles, candlesByResolution, options });
    sendJson(response, 200, { instrumentName, updatedAt: Date.now(), ...decision });
    return;
  }

  if (url.pathname === "/api/optimize" && request.method === "POST") {
    const body = await readJsonRequest(request);
    const instrumentName = body.instrumentName ?? "BTC-PERPETUAL";
    const strategyId     = body.strategyId ?? "support-resistance-v1";
    const strategy = getStrategy(strategyId);
    if (!strategy) {
      sendJson(response, 400, { error: `Onbekende strategie: ${strategyId}` });
      return;
    }
    const rawLookback  = Number(body.lookbackDays ?? 90);
    const lookbackDays = Number.isFinite(rawLookback) && rawLookback > 0 ? rawLookback : 90;
    const oosPct       = Math.min(50, Math.max(5, Number(body.outOfSamplePct ?? 20)));
    const paramGrid    = body.paramGrid ?? {};

    const combos = cartesianProduct(paramGrid);
    if (combos.length > 200) {
      sendJson(response, 400, { error: `Te veel combinaties: ${combos.length}. Maximum is 200.` });
      return;
    }
    if (!combos.length) {
      sendJson(response, 400, { error: "Selecteer minimaal één parameterwaarde per dimensie." });
      return;
    }

    const entryResolution = strategy.chartResolution ?? "15m";
    const levelResolution = strategy.levelResolution ?? "4h";
    const endTimestamp    = nowMs();
    const startTimestamp  = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const uniqueResolutions = [...new Set(
      strategy.requiredResolutions?.length ? strategy.requiredResolutions : [entryResolution, levelResolution]
    )];

    const candlesByResolution = Object.fromEntries(
      (await Promise.allSettled(
        uniqueResolutions.map(async (res) => [res, await getCandles({ instrumentName, resolution: res, startTimestamp, endTimestamp })])
      ))
        .filter(r => r.status === "fulfilled")
        .map(r => r.value)
    );

    const entryCandles = candlesByResolution[entryResolution] ?? [];
    const levelCandles = candlesByResolution[levelResolution] ?? [];
    const baseOptions  = body.baseOptions ?? {};

    const results = combos.map(paramCombo => {
      const options = { ...baseOptions, ...paramCombo, outOfSamplePct: oosPct };
      const r = runStrategyBacktest({ strategyId, entryCandles, levelCandles, candlesByResolution, options });
      const isM  = r.walkForward?.metricsIS  ?? r.metrics;
      const oosM = r.walkForward?.metricsOOS ?? null;
      const isR  = isM?.totalR  ?? 0;
      const oosR = oosM?.totalR ?? 0;
      const ratio = isR !== 0 ? Math.round((oosR / Math.abs(isR)) * 100) : null;
      return { params: paramCombo, isMetrics: isM, oosMetrics: oosM, ratio };
    });

    results.sort((a, b) =>
      (b.oosMetrics?.totalR ?? b.isMetrics?.totalR ?? -99) -
      (a.oosMetrics?.totalR ?? a.isMetrics?.totalR ?? -99)
    );

    sendJson(response, 200, { instrumentName, strategyId, lookbackDays, oosPct, totalCombinations: combos.length, results });
    return;
  }

  sendJson(response, 404, { error: "Unknown API route" });
}

async function serveStatic(request, response) {
  const url = parseQuery(request);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(join(publicDir, pathname));

  if (!safePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(safePath);
    const type = contentTypes[extname(safePath)] ?? "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

server.listen(port, () => {
  console.log(`Trading research app running at http://localhost:${port}`);
});
