import test from "node:test";
import assert from "node:assert/strict";
import {
  getStrategy,
  listStrategies,
  runStrategyBacktest
} from "../public/shared/strategyRegistry.mjs";

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

test("strategy registry exposes support resistance strategy", () => {
  const strategies = listStrategies();
  assert.equal(strategies.length >= 2, true);
  assert.equal(strategies[0].id, "support-resistance-v1");
  assert.equal(
    strategies.some((strategy) => strategy.id === "doopiecash-naked-price-action-v1"),
    true
  );
  assert.equal(getStrategy("support-resistance-v1").name, "Support / Resistance v1");
});

test("strategy dispatcher tags backtest result with selected strategy", () => {
  const candles = Array.from({ length: 60 }, (_, index) => {
    const price = 100 + Math.sin(index / 4) * 6;
    return candle(index, {
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price + 0.5,
      volume: 120
    });
  });

  const result = runStrategyBacktest({
    strategyId: "support-resistance-v1",
    entryCandles: candles,
    levelCandles: candles,
    options: {
      swingWindow: 2,
      minTouches: 2,
      volumeMultiplier: 1
    }
  });

  assert.equal(result.strategy, "support-resistance-v1");
  assert.equal(result.strategyName, "Support / Resistance v1");
  assert.equal(Array.isArray(result.trades), true);
});

test("doopiecash strategy can run through dispatcher", () => {
  const m3 = Array.from({ length: 360 }, (_, index) => {
    const price = 100 + Math.sin(index / 12) * 4 + index * 0.02;
    return candle(index, {
      open: price - 0.3,
      high: price + 0.8,
      low: price - 0.8,
      close: price + 0.35,
      volume: index % 20 === 0 ? 180 : 120
    });
  });
  const m15 = Array.from({ length: 120 }, (_, index) => {
    const price = 100 + Math.sin(index / 5) * 5 + index * 0.05;
    return candle(index * 5, {
      open: price - 0.4,
      high: price + 1.2,
      low: price - 1.2,
      close: price + 0.45,
      volume: 600
    });
  });
  const h4 = Array.from({ length: 90 }, (_, index) => {
    const price = 98 + Math.sin(index / 4) * 7 + index * 0.08;
    return candle(index * 80, {
      open: price - 0.7,
      high: price + 2,
      low: price - 2,
      close: price + 0.8,
      volume: 1500
    });
  });
  const daily = Array.from({ length: 45 }, (_, index) => {
    const price = 94 + index * 0.7 + Math.sin(index / 3) * 3;
    return candle(index * 480, {
      open: price - 1,
      high: price + 3,
      low: price - 3,
      close: price + 1.2,
      volume: 6000
    });
  });

  const result = runStrategyBacktest({
    strategyId: "doopiecash-naked-price-action-v1",
    entryCandles: m3,
    levelCandles: h4,
    candlesByResolution: {
      "3m": m3,
      "15m": m15,
      "4h": h4,
      "1D": daily,
      "1W": daily.slice(0, 8)
    },
    options: {
      minimumScoreToTrade: 70
    }
  });

  assert.equal(result.strategy, "doopiecash-naked-price-action-v1");
  assert.equal(result.strategyName, "Doopiecash Naked Price Action v1");
  assert.equal(Array.isArray(result.levels), true);
  assert.equal(Array.isArray(result.trades), true);
  assert.equal(typeof result.metrics.averageScore, "number");
});
