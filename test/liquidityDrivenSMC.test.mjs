import test from "node:test";
import assert from "node:assert/strict";
import {
  runLiquidityDrivenSMCBacktest,
  scanLiquidityDrivenSMC
} from "../public/shared/liquidityDrivenSMC.mjs";

// ─── Candle helpers ───────────────────────────────────────────────────────────

function flat(count, startTime, step, { open = 100, high = 103, low = 97, close = 100, volume = 200 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * step, open, high, low, close, volume
  }));
}

// ─── Fixture: prev_day_low sweep + instant reclaim + CHOCH → long trade ──────
//
// Layout (all times in unix seconds):
//   daily[0..19] at t=0,86400,...: provides prev_day_low pools at 97
//   h4[0..29]   at t=0,14400,...: provides range context (high=130)
//   m15[0..34]  at t=20×86400,..: padding for m15Index
//   m3[0..79]   at t=20×86400,..: entry candles
//     idx 0..29: ranging above pool (98–100)
//     idx 30:    SWEEP — low=95 (< pool=97)
//     idx 31:    RECLAIM — close=98 (> pool=97)  barsToReclaim=1
//     idx 32..40: ranging around 99
//     idx 41:    CHOCH — close=101.5 (> refHigh=100)
//     idx 42..79: trending up so TP1 is hit
//
// Score breakdown (expected 93, grade A_plus):
//   daily+H4 bias aligned  → +20
//   pool: prev_day_low      → +16
//   instant reclaim         → +20
//   bullish BOS/CHOCH       → +15
//   in discount (< midpoint)→ +10
//   close entry             → +7
//   RR quality              → +5
// ─────────────────────────────────────────────────────────────────────────────

function makeSMCLongFixture() {
  const D = 86400;
  const M3 = 180;
  const H4 = 14400;

  // 20 uptrending daily candles: first half close=100, second half close=103 → "long" bias
  // low=97 everywhere → prev_day_low pools at 97 for days 0–18
  const dailyCandles = Array.from({ length: 20 }, (_, i) => ({
    time: i * D,
    open: i < 10 ? 98 : 100,
    high: i < 10 ? 103 : 106,
    low: 97,
    close: i < 10 ? 100 : 103,
    volume: 2000
  }));

  // 30 H4 candles: uptrending closes for h4Bias="long", last candle high=130 for range
  const h4Candles = Array.from({ length: 30 }, (_, i) => ({
    time: i * H4,
    open: 100 + i * 0.5,
    high: i === 29 ? 130 : 110,
    low: 90,
    close: i === 29 ? 120 : 100 + i * 0.6,
    volume: 1000
  }));

  // 35 M15 candles starting at day 20 — no special structure needed
  const m15Start = 20 * D;
  const m15Candles = flat(35, m15Start, 900, { open: 99, high: 102, low: 97, close: 99.5, volume: 200 });

  // 3m candles starting at day 20
  const m3Start = 20 * D;
  const m3Candles = [];

  // idx 0–29: ranging above pool
  for (let i = 0; i < 30; i++) {
    m3Candles.push({ time: m3Start + i * M3, open: 99, high: 100, low: 98, close: 99.5, volume: 150 });
  }
  // idx 30: SWEEP (low=95 < pool=97)
  m3Candles.push({ time: m3Start + 30 * M3, open: 98, high: 100, low: 95, close: 97.5, volume: 300 });
  // idx 31: RECLAIM (close=98 > pool=97)
  m3Candles.push({ time: m3Start + 31 * M3, open: 96, high: 100, low: 95, close: 98, volume: 250 });
  // idx 32–40: ranging around 99 (all highs ≤ 100 so refHigh stays at 100)
  for (let i = 32; i < 41; i++) {
    m3Candles.push({ time: m3Start + i * M3, open: 98, high: 100, low: 97.5, close: 99, volume: 150 });
  }
  // idx 41: CHOCH (close=101.5 > refHigh=100)
  m3Candles.push({ time: m3Start + 41 * M3, open: 99, high: 103, low: 98.5, close: 101.5, volume: 300 });
  // idx 42–79: trending up so TP1 (≈ 108) is hit
  for (let i = 42; i < 80; i++) {
    const rise = (i - 41) * 0.15;
    m3Candles.push({ time: m3Start + i * M3, open: 101.5 + rise, high: 105 + rise, low: 100.5 + rise, close: 103 + rise, volume: 150 });
  }

  return {
    entryCandles: m3Candles,
    levelCandles: h4Candles,
    candlesByResolution: {
      "3m": m3Candles,
      "15m": m15Candles,
      "4h": h4Candles,
      "1D": dailyCandles,
      "1W": []
    }
  };
}

// ─── Structure tests ──────────────────────────────────────────────────────────

test("SMC backtest returns expected top-level fields", () => {
  const result = runLiquidityDrivenSMCBacktest({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });

  assert.equal(result.strategy, "liquidity-driven-smc-v1");
  assert.ok(Array.isArray(result.trades), "trades must be array");
  assert.ok(Array.isArray(result.levels), "levels must be array");
  assert.ok(Array.isArray(result.equityCurve), "equityCurve must be array");
  assert.ok(typeof result.metrics === "object", "metrics must be object");
});

test("SMC backtest with empty candles returns zero trades", () => {
  const result = runLiquidityDrivenSMCBacktest({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });
  assert.equal(result.trades.length, 0);
});

test("SMC backtest with fewer than 32 M3 candles returns zero trades (loop guard)", () => {
  // Loop starts at i=30; needs m3[i+1] too → requires ≥ 32 candles to ever enter
  const few = flat(30, 0, 180);
  const result = runLiquidityDrivenSMCBacktest({
    entryCandles: few,
    levelCandles: flat(5, 0, 14400),
    candlesByResolution: { "3m": few, "15m": [], "4h": flat(5, 0, 14400), "1D": [], "1W": [] }
  });
  assert.equal(result.trades.length, 0);
});

// ─── Signal fixture test ──────────────────────────────────────────────────────

test("prev_day_low sweep + instant reclaim + CHOCH produces a long trade", () => {
  const fixture = makeSMCLongFixture();
  const result = runLiquidityDrivenSMCBacktest(fixture);

  const longTrades = result.trades.filter(t => t.direction === "long");
  assert.ok(
    longTrades.length > 0,
    `expected ≥1 long trade, got ${result.trades.length} total trade(s)`
  );
});

test("SMC long trade has expected metadata fields", () => {
  const fixture = makeSMCLongFixture();
  const result = runLiquidityDrivenSMCBacktest(fixture);

  const trade = result.trades.find(t => t.direction === "long");
  assert.ok(trade, "must have a long trade");

  assert.equal(trade.direction, "long");
  assert.equal(trade.poolType, "prev_day_low");
  assert.ok(typeof trade.poolId === "string", "poolId must be a string");
  assert.ok(typeof trade.score === "number", "score must be a number");
  assert.ok(typeof trade.grade === "string", "grade must be a string");
  assert.ok(Array.isArray(trade.reasons), "reasons must be an array");
  assert.ok(trade.reasons.length > 0, "reasons must not be empty");
  assert.ok(typeof trade.dailyBias === "string", "dailyBias must be a string");
  assert.ok(typeof trade.initialRR === "number", "initialRR must be a number");
  assert.ok(trade.initialRR >= 2, "initialRR must be at least minRR=2");
  assert.ok(typeof trade.rMultiple === "number", "rMultiple must be a number");
});

test("SMC long trade score is at or above minimumScoreToTrade", () => {
  const fixture = makeSMCLongFixture();
  const result = runLiquidityDrivenSMCBacktest(fixture);

  const trade = result.trades.find(t => t.direction === "long");
  assert.ok(trade, "must have a long trade");
  assert.ok(trade.score >= 65, `score=${trade.score} must be >= minimumScoreToTrade=65`);
});

// ─── Scan function tests ──────────────────────────────────────────────────────

test("scanLiquidityDrivenSMC returns { setups, currentPrice } shape", () => {
  const result = scanLiquidityDrivenSMC({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });

  assert.ok("setups" in result, "must have setups");
  assert.ok("currentPrice" in result, "must have currentPrice");
  assert.ok(Array.isArray(result.setups), "setups must be array");
});

test("scanLiquidityDrivenSMC with empty 3m candles returns empty setups", () => {
  const result = scanLiquidityDrivenSMC({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });
  assert.equal(result.setups.length, 0);
  assert.equal(result.currentPrice, 0);
});
