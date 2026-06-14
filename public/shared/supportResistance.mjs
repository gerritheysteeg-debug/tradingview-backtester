import { simulateTrade, calculateMetrics, buildEquityCurve } from "./tradeSimulator.mjs";

const DEFAULT_OPTIONS = {
  swingWindow: 3,
  levelTolerancePct: 0.35,
  minTouches: 2,
  volumeLookback: 20,
  volumeMultiplier: 1.15,
  stopBufferPct: 0.05,
  stopMode: "swing",
  swingStopLookback: 12,
  maxHoldBars: 180,
  maxLevelAgeDays: 0,
  direction: "both",
  partials: [
    { r: 1, size: 0.35 },
    { r: 2, size: 0.25 },
    { r: 3, size: 0.4 }
  ]
};

export function runSupportResistanceBacktest({
  entryCandles,
  levelCandles,
  options = {}
}) {
  const config = normalizeOptions(options);
  const levels = detectLevels(levelCandles, config);
  const trades = simulateTrades(entryCandles, levels, config);
  const metrics = calculateMetrics(trades);
  const equityCurve = buildEquityCurve(trades);

  return {
    strategy: "support-resistance-v1",
    options: config,
    levels,
    trades,
    metrics,
    equityCurve
  };
}

export function detectLevels(candles, options = {}) {
  const config = normalizeOptions(options);
  const pivots = detectPivots(candles, config.swingWindow);
  const levels = [];

  for (const pivot of pivots) {
    const tolerance = pivot.price * (config.levelTolerancePct / 100);
    const existing = levels.find(
      (level) => Math.abs(level.price - pivot.price) <= tolerance
    );

    if (existing) {
      const totalTouches = existing.touches + 1;
      existing.price =
        (existing.price * existing.touches + pivot.price) / totalTouches;
      existing.touches = totalTouches;
      existing.lastTouchTime = Math.max(existing.lastTouchTime, pivot.time);
      existing.types.add(pivot.type);
      existing.pivots.push(pivot);
      continue;
    }

    levels.push({
      id: `level-${levels.length + 1}`,
      price: pivot.price,
      touches: 1,
      firstTouchTime: pivot.time,
      lastTouchTime: pivot.time,
      types: new Set([pivot.type]),
      pivots: [pivot]
    });
  }

  let filtered = levels.filter((level) => level.touches >= config.minTouches);

  if (config.maxLevelAgeDays > 0 && candles.length > 0) {
    const lastTime = candles[candles.length - 1].time;
    const cutoff = lastTime - config.maxLevelAgeDays * 86400;
    filtered = filtered.filter((level) => level.lastTouchTime >= cutoff);
  }

  return filtered
    .map((level) => ({
      ...level,
      type: level.types.size > 1 ? "both" : [...level.types][0],
      types: [...level.types],
      strength: level.touches * recencyScore(candles, level.lastTouchTime)
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 18);
}

export function detectPivots(candles, swingWindow = 3) {
  const pivots = [];

  for (let i = swingWindow; i < candles.length - swingWindow; i += 1) {
    const candle = candles[i];
    const left = candles.slice(i - swingWindow, i);
    const right = candles.slice(i + 1, i + swingWindow + 1);
    const neighbors = [...left, ...right];
    const isHigh = neighbors.every((item) => candle.high >= item.high);
    const isLow = neighbors.every((item) => candle.low <= item.low);

    if (isHigh) {
      pivots.push({
        type: "resistance",
        price: candle.high,
        time: candle.time,
        index: i
      });
    }

    if (isLow) {
      pivots.push({
        type: "support",
        price: candle.low,
        time: candle.time,
        index: i
      });
    }
  }

  return pivots;
}

function simulateTrades(candles, levels, config) {
  const trades = [];
  let openUntilIndex = -1;
  const invalidated = new Set();

  for (let i = Math.max(config.volumeLookback, config.swingStopLookback); i < candles.length - 2; i += 1) {
    if (i <= openUntilIndex) continue;

    const candle = candles[i];

    for (const level of levels) {
      if (invalidated.has(level.id)) continue;
      const tol = level.price * (config.levelTolerancePct / 100);
      const supportBroken =
        (level.type === "support" || level.type === "both") &&
        candle.close < level.price - tol;
      const resistanceBroken =
        (level.type === "resistance" || level.type === "both") &&
        candle.close > level.price + tol;
      if (supportBroken || resistanceBroken) {
        invalidated.add(level.id);
      }
    }

    const volumeAverage = averageVolume(candles, i, config.volumeLookback);
    if (volumeAverage === 0 || candle.volume < volumeAverage * config.volumeMultiplier) {
      continue;
    }

    const setup = findSetup(candles, i, levels, config, invalidated);
    if (!setup) continue;

    const trade = playTrade(candles, i, setup, config);
    if (!trade) continue;

    openUntilIndex = trade.exitIndex;
    trades.push({
      id: `T${trades.length + 1}`,
      ...trade
    });
  }

  for (const level of levels) {
    level.active = !invalidated.has(level.id);
  }

  return trades;
}

function findSetup(candles, index, levels, config, invalidated = new Set()) {
  const candle = candles[index];
  const previous = candles[index - 1];

  for (const level of levels) {
    if (invalidated.has(level.id)) continue;
    if (level.lastTouchTime >= candle.time) continue;

    const tolerance = level.price * (config.levelTolerancePct / 100);
    const touchedSupport = candle.low <= level.price + tolerance && candle.close > level.price;
    const touchedResistance = candle.high >= level.price - tolerance && candle.close < level.price;
    const bullishClose = candle.close > candle.open && candle.close > previous.close;
    const bearishClose = candle.close < candle.open && candle.close < previous.close;

    if (
      touchedSupport &&
      bullishClose &&
      (config.direction === "both" || config.direction === "long") &&
      (level.type === "support" || level.type === "both")
    ) {
      const stop = resolveStop({
        candles,
        index,
        levels,
        level,
        direction: "long",
        config
      });
      if (!stop || stop.price >= candle.close) continue;
      return {
        direction: "long",
        level,
        entry: candle.close,
        stop: stop.price,
        stopMode: stop.mode,
        stopReference: stop.reference
      };
    }

    if (
      touchedResistance &&
      bearishClose &&
      (config.direction === "both" || config.direction === "short") &&
      (level.type === "resistance" || level.type === "both")
    ) {
      const stop = resolveStop({
        candles,
        index,
        levels,
        level,
        direction: "short",
        config
      });
      if (!stop || stop.price <= candle.close) continue;
      return {
        direction: "short",
        level,
        entry: candle.close,
        stop: stop.price,
        stopMode: stop.mode,
        stopReference: stop.reference
      };
    }
  }

  return null;
}

export function resolveStop({ candles, index, levels, level, direction, config }) {
  if (config.stopMode === "level2") {
    const levelStop = levelTwoStop({ levels, level, direction, config });
    if (levelStop) return levelStop;
  }

  return swingStop({ candles, index, direction, config });
}

function levelTwoStop({ levels, level, direction, config }) {
  const lower = direction === "long";
  const directionalTypes = lower ? ["support", "both"] : ["resistance", "both"];
  const beyondCurrentLevel = levels.filter((candidate) =>
    lower ? candidate.price < level.price : candidate.price > level.price
  );
  const preferred = beyondCurrentLevel.filter((candidate) =>
    directionalTypes.includes(candidate.type)
  );
  const candidates = preferred.length ? preferred : beyondCurrentLevel;
  const sorted = candidates.sort((a, b) =>
    lower ? b.price - a.price : a.price - b.price
  );
  const levelTwo = sorted[0];
  if (!levelTwo) return null;

  return {
    price:
      direction === "long"
        ? levelTwo.price * (1 - config.stopBufferPct / 100)
        : levelTwo.price * (1 + config.stopBufferPct / 100),
    mode: "level2",
    reference: levelTwo.id
  };
}

function swingStop({ candles, index, direction, config }) {
  const price =
    direction === "long"
      ? recentSwingLow(candles, index, config.swingStopLookback)
      : recentSwingHigh(candles, index, config.swingStopLookback);

  if (!price) return null;

  return {
    price:
      direction === "long"
        ? price * (1 - config.stopBufferPct / 100)
        : price * (1 + config.stopBufferPct / 100),
    mode: config.stopMode === "level2" ? "swing_fallback" : "swing",
    reference: "recent_swing"
  };
}

function playTrade(candles, signalIndex, setup, config) {
  const entryIndex = signalIndex + 1;
  if (!candles[entryIndex]) return null;

  return simulateTrade(candles, {
    direction:         setup.direction,
    entryIndex,
    entry:             candles[entryIndex].open,
    stop:              setup.stop,
    partials:          config.partials,
    moveStopToBEAfterTP: 1,
    maxHoldBars:       config.maxHoldBars,
    meta: {
      signalIndex,
      signalTime:    candles[signalIndex].time,
      levelId:       setup.level.id,
      levelPrice:    setup.level.price,
      stopMode:      setup.stopMode,
      stopReference: setup.stopReference
    }
  });
}


function recentSwingLow(candles, index, lookback) {
  let low = Infinity;
  for (let i = Math.max(0, index - lookback); i <= index; i += 1) {
    low = Math.min(low, candles[i].low);
  }
  return Number.isFinite(low) ? low : null;
}

function recentSwingHigh(candles, index, lookback) {
  let high = -Infinity;
  for (let i = Math.max(0, index - lookback); i <= index; i += 1) {
    high = Math.max(high, candles[i].high);
  }
  return Number.isFinite(high) ? high : null;
}

function averageVolume(candles, index, lookback) {
  const start = Math.max(0, index - lookback);
  const sample = candles.slice(start, index);
  if (!sample.length) return 0;
  return sample.reduce((sum, candle) => sum + candle.volume, 0) / sample.length;
}

function recencyScore(candles, time) {
  if (!candles.length) return 1;
  const last = candles[candles.length - 1].time;
  const first = candles[0].time;
  const span = Math.max(1, last - first);
  return 1 + (time - first) / span;
}

function normalizeOptions(options) {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const partialTotal = merged.partials.reduce((sum, partial) => sum + partial.size, 0);
  return {
    ...merged,
    partials: merged.partials.map((partial) => ({
      r: Number(partial.r),
      size: Number(partial.size) / partialTotal
    }))
  };
}

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

// ─── Live Signal Scanner ──────────────────────────────────────────────────────

export function scanSupportResistance({ entryCandles, levelCandles, options = {} }) {
  const config = normalizeOptions(options);
  // Use minTouches:1 for scan — we want candidate levels, not just proven ones
  const levels = detectLevels(levelCandles, { ...config, minTouches: 1 });
  if (!entryCandles.length || !levels.length) return { setups: [], currentPrice: 0 };

  const currentPrice = entryCandles[entryCandles.length - 1].close;
  const lastIndex = entryCandles.length - 1;
  const tol = currentPrice * (config.levelTolerancePct / 100);

  // For the scan we care about proximity, not full historical invalidation.
  // Only check the last 30 entry candles for recent breaks.
  const recentCandles = entryCandles.slice(-30);
  const recentlyBrokenDown = new Set();
  const recentlyBrokenUp = new Set();
  for (const candle of recentCandles) {
    for (const level of levels) {
      const t = level.price * (config.levelTolerancePct / 100);
      if (candle.close < level.price - t) recentlyBrokenDown.add(level.id);
      if (candle.close > level.price + t) recentlyBrokenUp.add(level.id);
    }
  }

  // Supports: below current price, not recently broken downward
  const supports = levels
    .filter(l => !recentlyBrokenDown.has(l.id) && l.price < currentPrice - tol)
    .sort((a, b) => b.price - a.price);
  // Resistances: above current price, not recently broken upward
  const resistances = levels
    .filter(l => !recentlyBrokenUp.has(l.id) && l.price > currentPrice + tol)
    .sort((a, b) => a.price - b.price);

  const setups = [];

  if (supports.length && config.direction !== "short") {
    const level = supports[0];
    // Stop at next support below entry, or 1% fixed buffer — NOT current swing (entry not reached yet)
    const stopRef = supports[1]?.price ?? level.price * (1 - 1.0 / 100);
    const stop = round(stopRef * (1 - config.stopBufferPct / 100), 1);
    const risk = level.price - stop;
    const tp3 = resistances[0]?.price ?? level.price + risk * 3;
    const dist = round((currentPrice - level.price) / currentPrice * 100, 2);
    const proximity = (currentPrice - level.price) / tol;
    if (risk > 0) {
      setups.push({
        direction: "long",
        status: proximity <= 4 ? "watch" : "pending",
        entryPrice: round(level.price, 1),
        stopPrice: stop,
        tp1: round(level.price + risk, 1),
        tp2: round(level.price + risk * 2, 1),
        tp3: round(tp3, 1),
        score: Math.min(100, Math.round(level.strength * 8)),
        rr: round((tp3 - level.price) / risk, 2),
        description: `${level.type} · ${level.touches} touches`,
        distance: `${dist}% onder prijs`
      });
    }
  }

  if (resistances.length && config.direction !== "long") {
    const level = resistances[0];
    // Stop at next resistance above entry, or 1% fixed buffer
    const stopRef = resistances[1]?.price ?? level.price * (1 + 1.0 / 100);
    const stop = round(stopRef * (1 + config.stopBufferPct / 100), 1);
    const risk = stop - level.price;
    const tp3 = supports[0]?.price ?? level.price - risk * 3;
    const dist = round((level.price - currentPrice) / currentPrice * 100, 2);
    const proximity = (level.price - currentPrice) / tol;
    if (risk > 0) {
      setups.push({
        direction: "short",
        status: proximity <= 4 ? "watch" : "pending",
        entryPrice: round(level.price, 1),
        stopPrice: stop,
        tp1: round(level.price - risk, 1),
        tp2: round(level.price - risk * 2, 1),
        tp3: round(tp3, 1),
        score: Math.min(100, Math.round(level.strength * 8)),
        rr: round((level.price - tp3) / risk, 2),
        description: `${level.type} · ${level.touches} touches`,
        distance: `${dist}% boven prijs`
      });
    }
  }

  return { setups, currentPrice };
}
