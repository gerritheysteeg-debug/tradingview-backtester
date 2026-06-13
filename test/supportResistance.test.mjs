import test from "node:test";
import assert from "node:assert/strict";
import {
  detectLevels,
  resolveStop,
  runSupportResistanceBacktest
} from "../public/shared/supportResistance.mjs";

function candle(index, values) {
  return {
    time: index * 60,
    timestamp: index * 60_000,
    open: values.open,
    high: values.high,
    low: values.low,
    close: values.close,
    volume: values.volume ?? 100
  };
}

test("detectLevels groups repeated pivot zones", () => {
  const candles = [
    candle(0, { open: 100, high: 101, low: 99, close: 100 }),
    candle(1, { open: 100, high: 106, low: 98, close: 101 }),
    candle(2, { open: 101, high: 103, low: 97, close: 100 }),
    candle(3, { open: 100, high: 102, low: 94, close: 96 }),
    candle(4, { open: 96, high: 105.8, low: 95, close: 102 }),
    candle(5, { open: 102, high: 103, low: 94.2, close: 95 }),
    candle(6, { open: 95, high: 104, low: 93, close: 101 }),
    candle(7, { open: 101, high: 106.1, low: 99, close: 100 }),
    candle(8, { open: 100, high: 102, low: 94.1, close: 98 }),
    candle(9, { open: 98, high: 101, low: 96, close: 100 })
  ];

  const levels = detectLevels(candles, {
    swingWindow: 1,
    levelTolerancePct: 0.5,
    minTouches: 2
  });

  assert.equal(levels.length >= 1, true);
  assert.equal(levels.some((level) => level.touches >= 2), true);
});

test("support resistance backtest returns metrics and trades array", () => {
  const levelCandles = Array.from({ length: 80 }, (_, index) => {
    const base = index % 20 < 10 ? 100 : 110;
    return candle(index, {
      open: base,
      high: base + 4,
      low: base - 4,
      close: base + (index % 2 ? 1 : -1),
      volume: 100 + index
    });
  });

  const entryCandles = Array.from({ length: 160 }, (_, index) => {
    const wave = Math.sin(index / 6) * 6;
    const price = 105 + wave;
    return candle(index, {
      open: price - 0.8,
      high: price + 1.6,
      low: price - 1.8,
      close: price + 0.9,
      volume: index % 12 === 0 ? 220 : 120
    });
  });

  const result = runSupportResistanceBacktest({
    entryCandles,
    levelCandles,
    options: {
      swingWindow: 2,
      minTouches: 2,
      volumeMultiplier: 1
    }
  });

  assert.equal(Array.isArray(result.levels), true);
  assert.equal(Array.isArray(result.trades), true);
  assert.equal(typeof result.metrics.totalR, "number");
});

test("level2 stop uses next lower level for long setups", () => {
  const candles = [
    candle(0, { open: 100, high: 104, low: 96, close: 101 }),
    candle(1, { open: 101, high: 105, low: 95, close: 102 })
  ];
  const stop = resolveStop({
    candles,
    index: 1,
    direction: "long",
    level: { id: "level-1", price: 100, type: "support" },
    levels: [
      { id: "level-1", price: 100, type: "support" },
      { id: "level-2", price: 92, type: "support" },
      { id: "level-3", price: 80, type: "support" }
    ],
    config: {
      stopMode: "level2",
      stopBufferPct: 0.05,
      swingStopLookback: 12
    }
  });

  assert.equal(stop.mode, "level2");
  assert.equal(stop.reference, "level-2");
  assert.equal(Number(stop.price.toFixed(3)), 91.954);
});

test("level2 stop falls back to swing when no next level exists", () => {
  const candles = [
    candle(0, { open: 100, high: 104, low: 96, close: 101 }),
    candle(1, { open: 101, high: 105, low: 95, close: 102 })
  ];
  const stop = resolveStop({
    candles,
    index: 1,
    direction: "long",
    level: { id: "level-1", price: 100, type: "support" },
    levels: [{ id: "level-1", price: 100, type: "support" }],
    config: {
      stopMode: "level2",
      stopBufferPct: 0.05,
      swingStopLookback: 12
    }
  });

  assert.equal(stop.mode, "swing_fallback");
  assert.equal(stop.reference, "recent_swing");
  assert.equal(stop.price, 94.9525);
});
