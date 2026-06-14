import test from "node:test";
import assert from "node:assert/strict";
import {
  runVolatilityExpansionBacktest,
  scanVolatilityExpansion
} from "../public/shared/volatilityExpansion.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function candle(i, open, high, low, close, volume = 200) {
  return { time: i * 900, timestamp: i * 900_000, open, high, low, close, volume };
}

// Low-volatility (compressed) candles
function compressedCandles(n, price = 100) {
  return Array.from({ length: n }, (_, i) =>
    candle(i, price, price + 0.1, price - 0.1, price + (i % 2 ? 0.05 : -0.05))
  );
}

// Candles with normal volatility (range 2%)
function normalCandles(n, price = 100) {
  return Array.from({ length: n }, (_, i) => {
    const dir = i % 3 === 0 ? 1 : -1;
    return candle(i, price, price + 1.5, price - 1.5, price + dir * 0.8, 150 + i % 50);
  });
}

// ─── runVolatilityExpansionBacktest ───────────────────────────────────────────

test("runVolatilityExpansionBacktest returns correct result structure", () => {
  const candles = normalCandles(60);
  const result = runVolatilityExpansionBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles }
  });

  assert.equal(result.strategy, "volatility-expansion-v1");
  assert.ok(Array.isArray(result.trades));
  assert.ok(Array.isArray(result.levels));
  assert.ok(Array.isArray(result.equityCurve));
  assert.equal(typeof result.metrics.totalR, "number");
  assert.equal(typeof result.metrics.winRate, "number");
});

test("runVolatilityExpansionBacktest with too few candles returns no trades", () => {
  const candles = normalCandles(10);
  const result = runVolatilityExpansionBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles }
  });

  assert.equal(result.trades.length, 0);
});

test("runVolatilityExpansionBacktest with empty candles returns no trades", () => {
  const result = runVolatilityExpansionBacktest({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "4h": [], "1D": [] }
  });

  assert.equal(result.trades.length, 0);
  assert.equal(result.metrics.totalR, 0);
});

test("runVolatilityExpansionBacktest metrics include grossTotalR and totalCostR", () => {
  const candles = normalCandles(80);
  const result = runVolatilityExpansionBacktest({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles },
    options: { feePct: 0.05, slippagePct: 0.02 }
  });

  assert.ok("grossTotalR" in result.metrics);
  assert.ok("totalCostR" in result.metrics);
  assert.ok("totalR" in result.metrics);
});

// ─── scanVolatilityExpansion ──────────────────────────────────────────────────

test("scanVolatilityExpansion with empty candles returns no setups", () => {
  const result = scanVolatilityExpansion({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "4h": [], "1D": [] }
  });

  assert.ok(Array.isArray(result.setups));
  assert.equal(result.setups.length, 0);
});

test("scanVolatilityExpansion result always has currentPrice field", () => {
  const candles = normalCandles(40, 60000);
  const result = scanVolatilityExpansion({
    entryCandles: candles,
    levelCandles: candles,
    candlesByResolution: { "3m": candles, "4h": candles, "1D": candles }
  });

  assert.equal(typeof result.currentPrice, "number");
});
