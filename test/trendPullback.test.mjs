import test from "node:test";
import assert from "node:assert/strict";
import {
  runTrendPullbackBacktest,
  scanTrendPullback
} from "../public/shared/trendPullback.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function candle(i, open, high, low, close, volume = 200) {
  return { time: i * 3600, timestamp: i * 3_600_000, open, high, low, close, volume };
}

// Zigzag candles — alternates up/down so no clear trend direction
function zigzagCandles(n, price = 100) {
  return Array.from({ length: n }, (_, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const p = price + dir * 0.5;
    return candle(i, price, p + 0.3, p - 0.3, p);
  });
}

// Sine wave on top of a linear uptrend — creates unique, clearly detectable HH-HL pivots
function bullCandles(n, start = 100) {
  return Array.from({ length: n }, (_, i) => {
    const trend = i * 0.5;
    const wave  = 5 * Math.sin(Math.PI * (i % 12) / 6);
    const p = start + trend + wave;
    return candle(i, p - 0.2, p + 0.5, p - 0.5, p + 0.2);
  });
}

// ─── runTrendPullbackBacktest ─────────────────────────────────────────────────

test("runTrendPullbackBacktest returns correct result structure", () => {
  const candles = zigzagCandles(60);
  const result = runTrendPullbackBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles, "1W": [] }
  });

  assert.equal(result.strategy, "trend-pullback-v1");
  assert.ok(Array.isArray(result.trades));
  assert.ok(Array.isArray(result.levels));
  assert.ok(Array.isArray(result.equityCurve));
  assert.equal(typeof result.metrics.totalR, "number");
  assert.equal(typeof result.metrics.winRate, "number");
  assert.ok("trendDirection" in result.meta);
});

test("runTrendPullbackBacktest with too few candles returns no trades", () => {
  const candles = zigzagCandles(10);
  const result = runTrendPullbackBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles, "1W": [] }
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.meta.trendDirection, "neutral");
});

test("runTrendPullbackBacktest non-trending candles produce no pullback zones", () => {
  // Zigzag produces no consistent HH-HL or LH-LL structure → no pullback zones
  const candles = zigzagCandles(100);
  const result = runTrendPullbackBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles, "1W": [] }
  });

  // levels.length === 0 when no valid trend direction
  assert.equal(result.levels.length, 0);
});

test("runTrendPullbackBacktest bullish candles detect uptrend", () => {
  const dailyCandles = bullCandles(80);
  const m3Candles   = bullCandles(400, 100);
  const h4Candles   = bullCandles(60);

  const result = runTrendPullbackBacktest({
    entryCandles: m3Candles,
    levelCandles: h4Candles,
    candlesByResolution: {
      "3m": m3Candles,
      "4h": h4Candles,
      "1D": dailyCandles,
      "1W": []
    }
  });

  assert.equal(result.meta.trendDirection, "long");
  assert.ok(result.meta.trendStrength > 0);
});

// ─── scanTrendPullback ────────────────────────────────────────────────────────

test("scanTrendPullback with empty candles returns no setups", () => {
  const result = scanTrendPullback({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "4h": [], "1D": [], "1W": [] }
  });

  assert.ok(Array.isArray(result.setups));
  assert.equal(result.setups.length, 0);
});

test("scanTrendPullback with zigzag candles returns no setups", () => {
  const candles = zigzagCandles(80);
  const result = scanTrendPullback({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles, "1W": [] }
  });

  assert.equal(result.setups.length, 0);
});

test("scanTrendPullback result always has currentPrice field", () => {
  const candles = zigzagCandles(60, 50000);
  const result = scanTrendPullback({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles, "1W": [] }
  });

  assert.equal(typeof result.currentPrice, "number");
});
