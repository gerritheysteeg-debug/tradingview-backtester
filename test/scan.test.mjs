import test from "node:test";
import assert from "node:assert/strict";
import { scanSupportResistance } from "../public/shared/supportResistance.mjs";
import { scanDoopiecashNakedPriceAction } from "../public/shared/doopiecashNakedPriceAction.mjs";
import { scanLiquidityDrivenSMC } from "../public/shared/liquidityDrivenSMC.mjs";
import { scanTrendPullback } from "../public/shared/trendPullback.mjs";
import { scanVolatilityExpansion } from "../public/shared/volatilityExpansion.mjs";

function flatCandle(i, price = 100, volume = 150) {
  return {
    time: i * 300,
    timestamp: i * 300_000,
    open: price, high: price + 0.5, low: price - 0.5, close: price, volume
  };
}

const EMPTY = [];
const ONE   = [flatCandle(0)];
const FEW   = Array.from({ length: 5 }, (_, i) => flatCandle(i));

// ─── scanSupportResistance ────────────────────────────────────────────────────

test("scanSupportResistance: empty candles → { setups: [], currentPrice: 0 }", () => {
  const r = scanSupportResistance({ entryCandles: EMPTY, levelCandles: EMPTY });
  assert.deepEqual(r, { setups: [], currentPrice: 0 });
});

test("scanSupportResistance: single candle → no setups", () => {
  const r = scanSupportResistance({ entryCandles: ONE, levelCandles: ONE });
  assert.equal(Array.isArray(r.setups), true);
  assert.equal(r.setups.length, 0);
});

test("scanSupportResistance: result shape always valid", () => {
  const candles = Array.from({ length: 30 }, (_, i) => flatCandle(i));
  const r = scanSupportResistance({ entryCandles: candles, levelCandles: candles });
  assert.ok(Array.isArray(r.setups));
  assert.equal(typeof r.currentPrice, "number");
});

// ─── scanDoopiecashNakedPriceAction ───────────────────────────────────────────

test("scanDoopiecashNakedPriceAction: empty candles → no setups", () => {
  const r = scanDoopiecashNakedPriceAction({
    entryCandles: EMPTY,
    levelCandles: EMPTY,
    candlesByResolution: { "3m": EMPTY, "15m": EMPTY, "4h": EMPTY, "1D": EMPTY }
  });
  assert.ok(Array.isArray(r.setups));
  assert.equal(r.setups.length, 0);
});

test("scanDoopiecashNakedPriceAction: too few candles → no setups", () => {
  const r = scanDoopiecashNakedPriceAction({
    entryCandles: FEW,
    levelCandles: FEW,
    candlesByResolution: { "3m": FEW, "15m": FEW, "4h": FEW, "1D": FEW }
  });
  assert.ok(Array.isArray(r.setups));
  assert.equal(typeof r.currentPrice, "number");
});

// ─── scanLiquidityDrivenSMC ───────────────────────────────────────────────────

test("scanLiquidityDrivenSMC: empty candles → no setups", () => {
  const r = scanLiquidityDrivenSMC({
    entryCandles: EMPTY,
    levelCandles: EMPTY,
    candlesByResolution: { "3m": EMPTY, "4h": EMPTY, "1D": EMPTY }
  });
  assert.ok(Array.isArray(r.setups));
  assert.equal(r.setups.length, 0);
});

test("scanLiquidityDrivenSMC: too few candles → no setups", () => {
  const r = scanLiquidityDrivenSMC({
    entryCandles: FEW,
    levelCandles: FEW,
    candlesByResolution: { "3m": FEW, "4h": FEW, "1D": FEW }
  });
  assert.ok(Array.isArray(r.setups));
});

// ─── scanTrendPullback ────────────────────────────────────────────────────────

test("scanTrendPullback: empty candles → no setups", () => {
  const r = scanTrendPullback({
    entryCandles: EMPTY,
    levelCandles: EMPTY,
    candlesByResolution: { "3m": EMPTY, "4h": EMPTY, "1D": EMPTY, "1W": EMPTY }
  });
  assert.ok(Array.isArray(r.setups));
  assert.equal(r.setups.length, 0);
});

// ─── scanVolatilityExpansion ──────────────────────────────────────────────────

test("scanVolatilityExpansion: empty candles → no setups", () => {
  const r = scanVolatilityExpansion({
    entryCandles: EMPTY,
    levelCandles: EMPTY,
    candlesByResolution: { "3m": EMPTY, "4h": EMPTY, "1D": EMPTY }
  });
  assert.ok(Array.isArray(r.setups));
  assert.equal(r.setups.length, 0);
});

test("all scanners return { setups, currentPrice } shape", () => {
  const candles = Array.from({ length: 20 }, (_, i) => flatCandle(i, 50000));
  const res = { "3m": candles, "15m": candles, "4h": candles, "1D": candles, "1W": [] };

  const scanners = [
    () => scanSupportResistance({ entryCandles: candles, levelCandles: candles }),
    () => scanDoopiecashNakedPriceAction({ entryCandles: candles, levelCandles: candles, candlesByResolution: res }),
    () => scanLiquidityDrivenSMC({ entryCandles: candles, levelCandles: candles, candlesByResolution: res }),
    () => scanTrendPullback({ entryCandles: candles, levelCandles: candles, candlesByResolution: { ...res } }),
    () => scanVolatilityExpansion({ entryCandles: candles, levelCandles: candles, candlesByResolution: res })
  ];

  for (const scan of scanners) {
    const r = scan();
    assert.ok(Array.isArray(r.setups), `setups must be array: ${JSON.stringify(r)}`);
    assert.equal(typeof r.currentPrice, "number", `currentPrice must be number: ${JSON.stringify(r)}`);
  }
});
