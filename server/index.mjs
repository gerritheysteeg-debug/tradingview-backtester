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
  runStrategyBacktest
} from "../public/shared/strategyRegistry.mjs";

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
    const entryResolution =
      strategy.chartResolution ?? body.entryResolution ?? "15m";
    const levelResolution =
      strategy.levelResolution ?? body.levelResolution ?? "4h";
    const lookbackDays = Number(body.lookbackDays ?? 90);
    const endTimestamp = nowMs();
    const startTimestamp = endTimestamp - lookbackDays * 24 * 60 * 60 * 1000;
    const requiredResolutions = strategy.requiredResolutions?.length
      ? strategy.requiredResolutions
      : [entryResolution, levelResolution];
    const uniqueResolutions = [...new Set(requiredResolutions)];
    const candlesByResolution = Object.fromEntries(
      await Promise.all(
        uniqueResolutions.map(async (resolution) => [
          resolution,
          await getCandles({
            instrumentName,
            resolution,
            startTimestamp,
            endTimestamp
          })
        ])
      )
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
