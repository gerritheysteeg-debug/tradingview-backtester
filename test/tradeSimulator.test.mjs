import test from "node:test";
import assert from "node:assert/strict";
import { simulateTrade, calculateMetrics, buildEquityCurve } from "../public/shared/tradeSimulator.mjs";

// Helpers
function c(time, { open, high, low, close }) {
  return { time, open, high, low, close, volume: 100 };
}

const PARTIALS = [
  { r: 1, size: 0.33 },
  { r: 2, size: 0.33 },
  { r: 3, size: 0.34 }
];

// ─── simulateTrade ────────────────────────────────────────────────────────────

test("stop hit on first candle → -1R", () => {
  // Long entry at 100, stop at 90. Candle dips to 89 → stop hit.
  const candles = [
    c(1, { open: 100, high: 101, low: 89, close: 95 }),
    c(2, { open: 95,  high: 98,  low: 93, close: 96 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1
  });

  assert.equal(result.rMultiple, -1);
  assert.equal(result.exitReason, "stop");
  assert.equal(result.exitIndex, 0);
});

test("short stop hit → -1R", () => {
  // Short entry at 100, stop at 110. Candle rallies to 111 → stop hit.
  const candles = [
    c(1, { open: 100, high: 111, low: 98, close: 99 })
  ];
  const result = simulateTrade(candles, {
    direction: "short",
    entryIndex: 0,
    entry: 100,
    stop: 110,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1
  });

  assert.equal(result.rMultiple, -1);
  assert.equal(result.exitReason, "stop");
});

test("TP1 hit then break-even stop → partial win", () => {
  // Long entry 100, stop 90 (risk=10). TP1 = 110 (1R).
  // Candle 1: high reaches 110 → TP1 (0.33R), stop moves to 100.
  // Candle 2: low dips to 99 → break-even stop hit, remaining 0.67 closes at 0R.
  const candles = [
    c(1, { open: 100, high: 112, low: 101, close: 111 }), // TP1 hit
    c(2, { open: 111, high: 112, low: 99,  close: 100 })  // BE stop hit
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1
  });

  // 0.33 * 1R + 0.67 * 0R = 0.33R (rounded to 3 decimals)
  assert.equal(result.rMultiple, 0.33);
  assert.equal(result.exitReason, "breakeven_stop");
  assert.equal(result.partials[0].hit, true);
  assert.equal(result.partials[1].hit, false);
});

test("all partials hit → full win", () => {
  // Long entry 100, stop 90 (risk=10). TP1=110, TP2=120, TP3=130.
  // One big candle hits all targets.
  const candles = [
    c(1, { open: 100, high: 135, low: 100, close: 130 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1
  });

  // 0.33*1 + 0.33*2 + 0.34*3 = 0.33 + 0.66 + 1.02 = 2.01R
  assert.equal(result.rMultiple, 2.01);
  assert.equal(result.exitReason, "target_3r");
  assert.ok(result.partials.every(p => p.hit));
});

test("max hold exits at last candle close", () => {
  // Long entry 100, stop 90. Price drifts to 105 over 3 candles, never hits stop or TP.
  const candles = [
    c(1, { open: 100, high: 103, low: 99,  close: 102 }),
    c(2, { open: 102, high: 104, low: 100, close: 103 }),
    c(3, { open: 103, high: 106, low: 102, close: 105 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1,
    maxHoldBars: 3
  });

  assert.equal(result.exitReason, "max_hold");
  assert.equal(result.exitIndex, 2);
  // close is 105, entry 100, risk 10 → 0.5R per unit, all remaining
  assert.equal(result.rMultiple, 0.5);
});

test("TP1 + TP2, then time exit on remaining 0.34", () => {
  const candles = [
    c(1, { open: 100, high: 125, low: 100, close: 122 }), // TP1 (110) and TP2 (120) hit
    c(2, { open: 122, high: 123, low: 121, close: 122 })  // time exit at 122 (2.2R on remaining)
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1,
    maxHoldBars: 2
  });

  // 0.33*1 + 0.33*2 + 0.34*(122-100)/10 = 0.33 + 0.66 + 0.34*2.2 = 0.99 + 0.748 = 1.738 → round to 1.738
  const expected = round(0.33 * 1 + 0.33 * 2 + 0.34 * (122 - 100) / 10, 3);
  assert.equal(result.rMultiple, expected);
  assert.equal(result.partials[0].hit, true);
  assert.equal(result.partials[1].hit, true);
  assert.equal(result.partials[2].hit, false);
});

test("break-even disabled when moveStopToBEAfterTP is null", () => {
  // TP1 hit, then candle dips below entry — but no BE stop, so original stop still active.
  const candles = [
    c(1, { open: 100, high: 115, low: 101, close: 112 }), // TP1 hit, no BE
    c(2, { open: 112, high: 113, low: 95,  close: 96  })  // dips to 95, stop at 90 not hit
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: null,  // disabled
    maxHoldBars: 2
  });

  // Stop at 90 was NOT hit (low=95). Time exit at close=96.
  // 0.33*1 + remaining 0.67 * (96-100)/10 = 0.33 + 0.67*(-0.4) = 0.33 - 0.268 = 0.062
  assert.equal(result.exitReason, "max_hold");
  assert.ok(result.rMultiple < 0.33, "remaining should reduce total since price ended below entry");
});

test("MAE and MFE are tracked correctly", () => {
  // Long entry 100, stop 90. Candle 1: low=95 (adverse 0.5R), high=115 (fav 1.5R).
  const candles = [
    c(1, { open: 100, high: 115, low: 95, close: 110 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    moveStopToBEAfterTP: 1,
    maxHoldBars: 1
  });

  assert.equal(result.maxFavorableExcursionR, 1.5);
  assert.equal(result.maxAdverseExcursionR, 0.5);
});

test("meta fields pass through to result", () => {
  const candles = [c(1, { open: 100, high: 101, low: 89, close: 95 })];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    meta: { score: 82, grade: "A", strategyTag: "sr-v1" }
  });

  assert.equal(result.score, 82);
  assert.equal(result.grade, "A");
  assert.equal(result.strategyTag, "sr-v1");
});

test("returns null when risk is zero", () => {
  const candles = [c(1, { open: 100, high: 101, low: 99, close: 100 })];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 100,  // same as entry → risk=0
    partials: PARTIALS
  });

  assert.equal(result, null);
});

test("feePct + slippagePct reduce rMultiple and expose grossRMultiple", () => {
  // Long entry 100, stop 90 (risk=10).
  // costR = 2*(feePct+slippagePct)/100 * entry/risk
  //       = 2*(0.05+0.02)/100 * 100/10
  //       = 2 * 0.07/100 * 10
  //       = 0.0014 * 10 = 0.014R
  // Stop hit → grossR = -1R, net = -1 - 0.014 = -1.014R
  const candles = [
    c(1, { open: 100, high: 101, low: 89, close: 95 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    feePct: 0.05,
    slippagePct: 0.02
  });

  assert.equal(result.grossRMultiple, -1);
  assert.equal(result.costR, 0.014);
  assert.equal(result.rMultiple, -1.014);
});

test("feePct=0 slippagePct=0 leaves rMultiple equal to grossRMultiple", () => {
  const candles = [
    c(1, { open: 100, high: 135, low: 100, close: 130 })
  ];
  const result = simulateTrade(candles, {
    direction: "long",
    entryIndex: 0,
    entry: 100,
    stop: 90,
    partials: PARTIALS,
    feePct: 0,
    slippagePct: 0
  });

  assert.equal(result.costR, 0);
  assert.equal(result.rMultiple, result.grossRMultiple);
});

// ─── calculateMetrics ─────────────────────────────────────────────────────────

test("calculateMetrics computes win rate and profit factor", () => {
  const trades = [
    { rMultiple: 2.01, exitTime: 1, score: 80 },
    { rMultiple: -1,   exitTime: 2, score: 60 },
    { rMultiple: 0.33, exitTime: 3, score: 70 },
    { rMultiple: -1,   exitTime: 4, score: 55 }
  ];
  const m = calculateMetrics(trades);

  assert.equal(m.trades, 4);
  assert.equal(m.wins, 2);
  assert.equal(m.losses, 2);
  assert.equal(m.winRate, 50);
  assert.equal(m.totalR, round(2.01 - 1 + 0.33 - 1, 2));
  assert.ok(m.profitFactor > 1, "should be profitable overall");
});

test("calculateMetrics handles empty trades", () => {
  const m = calculateMetrics([]);
  assert.equal(m.trades, 0);
  assert.equal(m.winRate, 0);
  assert.equal(m.totalR, 0);
});

// ─── buildEquityCurve ─────────────────────────────────────────────────────────

test("buildEquityCurve accumulates R correctly", () => {
  const trades = [
    { rMultiple: 1, exitTime: 100 },
    { rMultiple: -0.5, exitTime: 200 },
    { rMultiple: 2, exitTime: 300 }
  ];
  const curve = buildEquityCurve(trades);

  assert.equal(curve.length, 3);
  assert.equal(curve[0].value, 1);
  assert.equal(curve[1].value, 0.5);
  assert.equal(curve[2].value, 2.5);
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function round(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
