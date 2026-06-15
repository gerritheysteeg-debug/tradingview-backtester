import test from "node:test";
import assert from "node:assert/strict";
import {
  runDoopiecashNakedPriceActionBacktest,
  scanDoopiecashNakedPriceAction
} from "../public/shared/doopiecashNakedPriceAction.mjs";

// ─── Candle helper ────────────────────────────────────────────────────────────

function flat(count, startTime, step, { open = 100, high = 103, low = 97, close = 100, volume = 100 } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    time: startTime + i * step, open, high, low, close, volume
  }));
}

// ─── Fixture: v_pattern_long_bos + m15_breakout + m3_bos → long trade ────────
//
// Timing (unix seconds):
//   daily[0..19]  t=0,86400,...,19×86400  — 20 uptrending daily candles
//   h4[0..29]     t=0,14400,...,29×14400  — 30 H4 candles, pivot low@100, pivot high@150
//   m15[0..34]    t=M3_BASE-30×900,...   — 35 M15 candles with breakout at idx 30
//   m3[0..59]     t=M3_BASE-30×180,...   — 60 3m candles with BOS signal at idx 30
//
// H4 zone structure:
//   pivot low  at idx 3 (low=100)  → support zone at 100
//   pivot high at idx 8 (high=150) → resistance zone at 150
//   idx 11–28: high=110 (recentHigh baseline for BullishBOS check)
//   idx 29: close=115 > recentHigh=110 → h4Setup=v_pattern_long_bos (direction=long)
//
// Score breakdown (expected 115, uncapped, grade A_plus):
//   dailyBias aligned  → +30
//   h4Setup aligned    → +25
//   m15Trigger aligned → +20
//   m3 BOS             → +15
//   fresh HTF zone     → +10
//   TP room >= 3R      → +10
//   volume confirms    → +5
//   no penalties (no conflict, no chop, targetRoom=8.9 ≥ 2)
// ─────────────────────────────────────────────────────────────────────────────

const M3_BASE = 20 * 86400; // day 20 = t=1728000

function makeDoopiecashLongFixture() {
  // Daily candles: first half close=100, second half close=103 → detectBias = "long"
  const dailyCandles = Array.from({ length: 20 }, (_, i) => ({
    time: i * 86400,
    open: i < 10 ? 98 : 100,
    high: i < 10 ? 103 : 106,
    low: i < 10 ? 95 : 98,
    close: i < 10 ? 100 : 103,
    volume: 2000
  }));

  // H4 candles:
  //   idx 0–2: high=112, low=105 (no pivot)
  //   idx 3:   low=100 → PIVOT LOW (support zone at 100)
  //   idx 4–7: high=112, low=105
  //   idx 8:   high=150 → PIVOT HIGH (resistance zone at 150)
  //   idx 9–10: high=112
  //   idx 11–28: high=110, close rising → recentHigh baseline = 110
  //   idx 29:  close=115 > recentHigh=110 → bullishBOS → h4Setup long
  const h4Candles = Array.from({ length: 30 }, (_, i) => {
    if (i === 3)  return { time: i * 14400, open: 105, high: 112, low: 100, close: 110, volume: 1000 };
    if (i === 8)  return { time: i * 14400, open: 130, high: 150, low: 125, close: 140, volume: 1000 };
    if (i === 29) return { time: i * 14400, open: 108, high: 115, low: 103, close: 115, volume: 1000 };
    const hi = (i >= 11 && i <= 28) ? 110 : 112;
    return { time: i * 14400, open: 106, high: hi, low: 105, close: 108, volume: 1000 };
  });

  // M15 candles: 35 candles, idx 30 has breakout close > recentHigh(6..30)=104
  const m15Start = M3_BASE - 30 * 900; // 30 candles before signal
  const m15Candles = Array.from({ length: 35 }, (_, i) => {
    if (i === 30) return { time: m15Start + i * 900, open: 101, high: 108, low: 101, close: 107, volume: 200 };
    return { time: m15Start + i * 900, open: 101, high: 104, low: 98, close: 101.5, volume: 100 };
  });

  // M3 candles: 60 candles, signal at idx 30 (BOS: close=105 > localHigh(10..30)=103)
  // Signal candle also has volume=150 > avg(100)*1.1=110 → volumeConfirms
  const m3Start = M3_BASE - 30 * 180;
  const m3Candles = Array.from({ length: 60 }, (_, i) => {
    if (i === 30) {
      return { time: m3Start + i * 180, open: 103, high: 107, low: 101, close: 105, volume: 150 };
    }
    const rise = i > 30 ? (i - 30) * 0.2 : 0;
    return {
      time: m3Start + i * 180,
      open: 100 + rise, high: 103 + rise, low: 99 + rise, close: 101 + rise,
      volume: 100
    };
  });

  return {
    entryCandles: m3Candles,
    levelCandles: h4Candles,
    candlesByResolution: {
      "3m": m3Candles,
      "15m": m15Candles,
      "4h": h4Candles,
      "1D": dailyCandles,
      "1W": []   // < 8 weekly → weeklyBias="neutral" → no HTF conflict
    }
  };
}

// ─── Structure tests ──────────────────────────────────────────────────────────

test("Doopiecash backtest returns expected top-level fields", () => {
  const result = runDoopiecashNakedPriceActionBacktest({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });

  assert.equal(result.strategy, "doopiecash-naked-price-action-v1");
  assert.ok(Array.isArray(result.trades), "trades must be array");
  assert.ok(Array.isArray(result.levels), "levels must be array");
  assert.ok(Array.isArray(result.equityCurve), "equityCurve must be array");
  assert.ok(typeof result.metrics === "object", "metrics must be object");
});

test("Doopiecash backtest with empty candles returns zero trades", () => {
  const result = runDoopiecashNakedPriceActionBacktest({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });
  assert.equal(result.trades.length, 0);
});

test("Doopiecash backtest with too few M3 candles returns zero trades", () => {
  // Loop starts at i=max(m3Lookback=20,volumeLookback=20)=20, needs m3[i+2] too
  const few = flat(22, M3_BASE, 180);
  const result = runDoopiecashNakedPriceActionBacktest({
    entryCandles: few,
    levelCandles: flat(5, 0, 14400),
    candlesByResolution: {
      "3m": few,
      "15m": flat(10, M3_BASE - 5000, 900),
      "4h": flat(5, 0, 14400),
      "1D": flat(5, 0, 86400),
      "1W": []
    }
  });
  assert.equal(result.trades.length, 0);
});

// ─── Signal fixture test ──────────────────────────────────────────────────────

test("well-formed signal fixture produces at least one long trade", () => {
  const fixture = makeDoopiecashLongFixture();
  const result = runDoopiecashNakedPriceActionBacktest(fixture);

  const longTrades = result.trades.filter(t => t.direction === "long");
  assert.ok(
    longTrades.length > 0,
    `expected ≥1 long trade, got ${result.trades.length} total trade(s)`
  );
});

test("Doopiecash long trade has expected metadata fields", () => {
  const fixture = makeDoopiecashLongFixture();
  const result = runDoopiecashNakedPriceActionBacktest(fixture);

  const trade = result.trades.find(t => t.direction === "long");
  assert.ok(trade, "must have a long trade");

  assert.equal(trade.direction, "long");
  assert.ok(typeof trade.score === "number", "score must be a number");
  assert.ok(typeof trade.grade === "string", "grade must be a string");
  assert.ok(["A_plus", "A", "B"].includes(trade.grade), `unexpected grade: ${trade.grade}`);
  assert.ok(Array.isArray(trade.reasons), "reasons must be array");
  assert.ok(trade.reasons.length > 0, "reasons must not be empty");
  assert.ok(Array.isArray(trade.penalties), "penalties must be array");
  assert.ok(typeof trade.h4Setup === "string", "h4Setup must be a string");
  assert.ok(typeof trade.m15Trigger === "string", "m15Trigger must be a string");
  assert.ok(typeof trade.entrySignal === "string", "entrySignal must be a string");
  assert.ok(typeof trade.dailyBias === "string", "dailyBias must be a string");
  assert.ok(typeof trade.rMultiple === "number", "rMultiple must be a number");
});

test("Doopiecash long trade score is at or above minimumScoreToTrade", () => {
  const fixture = makeDoopiecashLongFixture();
  const result = runDoopiecashNakedPriceActionBacktest(fixture);

  const trade = result.trades.find(t => t.direction === "long");
  assert.ok(trade, "must have a long trade");
  assert.ok(trade.score >= 70, `score=${trade.score} must be >= minimumScoreToTrade=70`);
});

// ─── Scan function tests ──────────────────────────────────────────────────────

test("scanDoopiecashNakedPriceAction returns { setups, currentPrice } shape", () => {
  const result = scanDoopiecashNakedPriceAction({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });

  assert.ok("setups" in result, "must have setups");
  assert.ok("currentPrice" in result, "must have currentPrice");
  assert.ok(Array.isArray(result.setups), "setups must be array");
});

test("scanDoopiecashNakedPriceAction with empty 3m candles returns empty setups", () => {
  const result = scanDoopiecashNakedPriceAction({
    entryCandles: [],
    levelCandles: [],
    candlesByResolution: { "3m": [], "15m": [], "4h": [], "1D": [], "1W": [] }
  });
  assert.equal(result.setups.length, 0);
  assert.equal(result.currentPrice, 0);
});
