/**
 * API integration tests — spins up the server on a dedicated test port,
 * runs validation-path requests that don't need real Deribit candles,
 * then tears it down.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const TEST_PORT = 5174;
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const SERVER_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "index.mjs");

// ─── helpers ──────────────────────────────────────────────────────────────────

function waitForPort(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const s = connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); resolve(); });
      s.once("error", () => {
        if (Date.now() >= deadline) return reject(new Error(`Port ${port} not ready`));
        setTimeout(attempt, 150);
      });
    }
    attempt();
  });
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = httpRequest(
      `${BASE}${path}`,
      {
        method,
        headers: {
          "content-type": "application/json",
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const get  = (path)       => apiRequest("GET",  path, null);
const post = (path, body) => apiRequest("POST", path, body);

// ─── server lifecycle ─────────────────────────────────────────────────────────

let serverProcess;

test.before(async () => {
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: "pipe"
  });
  serverProcess.stderr.on("data", () => {}); // suppress noise
  await waitForPort(TEST_PORT);
});

test.after(() => {
  serverProcess?.kill();
});

// ─── /api/health ──────────────────────────────────────────────────────────────

test("GET /api/health returns 200 with ok:true and strategies list", async () => {
  const { status, body } = await get("/api/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.strategies), "strategies should be array");
  assert.ok(body.strategies.length >= 5, "at least 5 strategies");
});

// ─── /api/strategies ──────────────────────────────────────────────────────────

test("GET /api/strategies returns 200 with 5 known strategies", async () => {
  const { status, body } = await get("/api/strategies");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.strategies));
  const ids = body.strategies.map(s => s.id);
  assert.ok(ids.includes("support-resistance-v1"));
  assert.ok(ids.includes("doopiecash-naked-price-action-v1"));
  assert.ok(ids.includes("liquidity-driven-smc-v1"));
  assert.ok(ids.includes("trend-pullback-v1"));
  assert.ok(ids.includes("volatility-expansion-v1"));
  assert.equal(ids.length, 5);
});

// ─── /api/backtest ────────────────────────────────────────────────────────────

test("POST /api/backtest with unknown strategyId returns 400", async () => {
  const { status, body } = await post("/api/backtest", {
    strategyId: "invalid-strategy-id",
    instrumentName: "BTC-PERPETUAL",
    lookbackDays: 7
  });
  assert.equal(status, 400);
  assert.ok(body.error?.includes("invalid-strategy-id"), `error should name the strategy, got: ${body.error}`);
});

// ─── /api/next-entry ──────────────────────────────────────────────────────────

test("GET /api/next-entry with unknown strategy returns 400", async () => {
  const { status, body } = await get("/api/next-entry?strategy=bogus-strategy&instrument=BTC-PERPETUAL&lookbackDays=7");
  assert.equal(status, 400);
  assert.ok(body.error?.includes("bogus-strategy"));
});

// ─── /api/optimize ────────────────────────────────────────────────────────────

test("POST /api/optimize with unknown strategyId returns 400", async () => {
  const { status, body } = await post("/api/optimize", {
    strategyId: "not-a-real-strategy",
    instrumentName: "BTC-PERPETUAL",
    paramGrid: { volumeMultiplier: [1.2, 1.5] }
  });
  assert.equal(status, 400);
  assert.ok(body.error?.includes("not-a-real-strategy"));
});

test("POST /api/optimize with too many combinations returns 400", async () => {
  // 7^3 = 343 > 200
  const vals = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
  const { status, body } = await post("/api/optimize", {
    strategyId: "support-resistance-v1",
    instrumentName: "BTC-PERPETUAL",
    paramGrid: { a: vals, b: vals, c: vals }
  });
  assert.equal(status, 400);
  assert.ok(body.error?.toLowerCase().includes("combin"), `expected combination error, got: ${body.error}`);
});

test("POST /api/optimize with empty paramGrid returns 400", async () => {
  const { status, body } = await post("/api/optimize", {
    strategyId: "support-resistance-v1",
    instrumentName: "BTC-PERPETUAL",
    paramGrid: {}
  });
  assert.equal(status, 400);
  assert.ok(body.error?.length > 0, "expected an error message");
});

// ─── malformed JSON ───────────────────────────────────────────────────────────

test("POST /api/backtest with malformed JSON returns 400", async () => {
  const { status, body } = await new Promise((resolve, reject) => {
    const payload = "{ not valid json";
    const req = httpRequest(
      `${BASE}/api/backtest`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
      },
      (res) => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  assert.equal(status, 400);
  assert.ok(body.error?.toLowerCase().includes("json"), `expected JSON error, got: ${body.error}`);
});

test("POST /api/optimize with malformed JSON returns 400", async () => {
  const { status, body } = await new Promise((resolve, reject) => {
    const payload = "{ broken";
    const req = httpRequest(
      `${BASE}/api/optimize`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
      },
      (res) => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
  assert.equal(status, 400);
  assert.ok(body.error?.toLowerCase().includes("json"), `expected JSON error, got: ${body.error}`);
});

// ─── /api/candles validation ─────────────────────────────────────────────────

test("GET /api/candles with invalid resolution returns 400", async () => {
  const { status, body } = await get("/api/candles?instrument=BTC-PERPETUAL&resolution=99x&lookbackDays=1");
  assert.equal(status, 400);
  assert.ok(body.error?.includes("resolution"), `expected resolution error, got: ${body.error}`);
});

test("GET /api/candles with negative lookbackDays returns 400", async () => {
  const { status, body } = await get("/api/candles?instrument=BTC-PERPETUAL&resolution=15m&lookbackDays=-5");
  assert.equal(status, 400);
  assert.ok(body.error?.toLowerCase().includes("lookback"), `expected lookback error, got: ${body.error}`);
});

test("GET /api/candles with empty instrument returns 400", async () => {
  const { status, body } = await get("/api/candles?instrument=&resolution=15m&lookbackDays=1");
  assert.equal(status, 400);
  assert.ok(body.error?.toLowerCase().includes("instrument"), `expected instrument error, got: ${body.error}`);
});

// ─── data quality ─────────────────────────────────────────────────────────────

test("GET /api/health includes supportedResolutions for client-side validation", async () => {
  const { status, body } = await get("/api/health");
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.supportedResolutions), "supportedResolutions should be array");
  assert.ok(body.supportedResolutions.includes("15m"), "should include 15m");
  assert.ok(body.supportedResolutions.includes("4h"),  "should include 4h");
  assert.ok(body.supportedResolutions.includes("1D"),  "should include 1D");
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

test("unknown API route returns 404", async () => {
  const { status } = await get("/api/does-not-exist");
  assert.equal(status, 404);
});
