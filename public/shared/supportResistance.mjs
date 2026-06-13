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

  return levels
    .filter((level) => level.touches >= config.minTouches)
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

  for (let i = Math.max(config.volumeLookback, config.swingStopLookback); i < candles.length - 2; i += 1) {
    if (i <= openUntilIndex) continue;

    const candle = candles[i];
    const volumeAverage = averageVolume(candles, i, config.volumeLookback);
    if (volumeAverage === 0 || candle.volume < volumeAverage * config.volumeMultiplier) {
      continue;
    }

    const setup = findSetup(candles, i, levels, config);
    if (!setup) continue;

    const trade = playTrade(candles, i, setup, config);
    if (!trade) continue;

    openUntilIndex = trade.exitIndex;
    trades.push({
      id: `T${trades.length + 1}`,
      ...trade
    });
  }

  return trades;
}

function findSetup(candles, index, levels, config) {
  const candle = candles[index];
  const previous = candles[index - 1];

  for (const level of levels) {
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
  const entryCandle = candles[entryIndex];
  if (!entryCandle) return null;

  const entry = entryCandle.open;
  const stop = setup.stop;
  const risk = Math.abs(entry - stop);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const partials = config.partials.map((partial) => ({
    ...partial,
    hit: false,
    price:
      setup.direction === "long"
        ? entry + risk * partial.r
        : entry - risk * partial.r
  }));

  let realizedR = 0;
  let remaining = 1;
  let exitIndex = entryIndex;
  let exitTime = entryCandle.time;
  let exitPrice = entry;
  let exitReason = "max_hold";

  const finalIndex = Math.min(candles.length - 1, entryIndex + config.maxHoldBars);

  for (let i = entryIndex; i <= finalIndex; i += 1) {
    const candle = candles[i];
    exitIndex = i;
    exitTime = candle.time;

    const stopHit =
      setup.direction === "long" ? candle.low <= stop : candle.high >= stop;

    if (stopHit) {
      realizedR -= remaining;
      exitPrice = stop;
      exitReason = "stop";
      remaining = 0;
      break;
    }

    for (const partial of partials) {
      if (partial.hit) continue;
      const targetHit =
        setup.direction === "long"
          ? candle.high >= partial.price
          : candle.low <= partial.price;

      if (targetHit) {
        partial.hit = true;
        realizedR += partial.r * partial.size;
        remaining -= partial.size;
        exitPrice = partial.price;
        exitReason = `target_${partial.r}r`;
      }
    }

    if (remaining <= 0.0001) {
      remaining = 0;
      break;
    }
  }

  if (remaining > 0) {
    const last = candles[exitIndex];
    const openR =
      setup.direction === "long"
        ? (last.close - entry) / risk
        : (entry - last.close) / risk;
    realizedR += openR * remaining;
    exitPrice = last.close;
  }

  return {
    direction: setup.direction,
    signalIndex,
    entryIndex,
    exitIndex,
    signalTime: candles[signalIndex].time,
    entryTime: candles[entryIndex].time,
    exitTime,
    entry,
    stop,
    exitPrice,
    levelId: setup.level.id,
    levelPrice: setup.level.price,
    stopMode: setup.stopMode,
    stopReference: setup.stopReference,
    exitReason,
    risk,
    rMultiple: round(realizedR, 3),
    partials: partials.map(({ r, size, price, hit }) => ({
      r,
      size,
      price,
      hit
    }))
  };
}

function calculateMetrics(trades) {
  const wins = trades.filter((trade) => trade.rMultiple > 0);
  const losses = trades.filter((trade) => trade.rMultiple < 0);
  const grossWin = wins.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.rMultiple, 0));
  const totalR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0);
  const averageR = trades.length ? totalR / trades.length : 0;
  const equity = buildEquityCurve(trades);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round((wins.length / trades.length) * 100, 1) : 0,
    profitFactor: grossLoss ? round(grossWin / grossLoss, 2) : round(grossWin, 2),
    totalR: round(totalR, 2),
    averageR: round(averageR, 2),
    maxDrawdownR: round(maxDrawdown(equity), 2)
  };
}

function buildEquityCurve(trades) {
  let equity = 0;
  return trades.map((trade) => {
    equity += trade.rMultiple;
    return {
      time: trade.exitTime,
      value: round(equity, 3)
    };
  });
}

function maxDrawdown(equityCurve) {
  let peak = 0;
  let worst = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.value);
    worst = Math.min(worst, point.value - peak);
  }

  return Math.abs(worst);
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
