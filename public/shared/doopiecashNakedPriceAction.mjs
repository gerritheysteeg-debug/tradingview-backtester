import { simulateTrade, calculateMetrics, buildEquityCurve } from "./tradeSimulator.mjs";

const DEFAULT_OPTIONS = {
  levelTolerancePct: 0.35,
  swingWindow: 3,
  microSwingWindow: 3,
  m15Lookback: 24,
  h4Lookback: 18,
  m3Lookback: 20,
  volumeLookback: 20,
  volumeMultiplier: 1.1,
  minimumScoreToTrade: 70,
  stopBufferPct: 0.05,
  stopMode: "structure",
  maxHoldBars: 240,
  feePct: 0.05,
  slippagePct: 0.02,
  direction: "both",
  partials: [
    { r: 1, size: 0.33 },
    { r: 2, size: 0.33 },
    { r: 3, size: 0.34 }
  ]
};

export function runDoopiecashNakedPriceActionBacktest({
  entryCandles,
  levelCandles,
  candlesByResolution = {},
  options = {}
}) {
  const config = normalizeOptions(options);
  const candles = {
    m3: candlesByResolution["3m"] ?? entryCandles,
    m15: candlesByResolution["15m"] ?? entryCandles,
    h4: candlesByResolution["4h"] ?? levelCandles,
    daily: candlesByResolution["1D"] ?? levelCandles,
    weekly: candlesByResolution["1W"] ?? []
  };
  const zones = buildZones(candles.h4, config);
  const trades = simulateDoopiecashTrades(candles, zones, config);
  const metrics = calculateMetrics(trades);
  const equityCurve = buildEquityCurve(trades);

  return {
    strategy: "doopiecash-naked-price-action-v1",
    options: config,
    levels: zones.map(zoneToLevel),
    trades,
    metrics,
    equityCurve
  };
}

function simulateDoopiecashTrades(candles, zones, config) {
  const trades = [];
  const m3 = candles.m3;
  let openUntilIndex = -1;
  let consecutiveLosses = 0;
  let cooldownUntilIndex = -1;

  for (let i = Math.max(config.m3Lookback, config.volumeLookback); i < m3.length - 2; i += 1) {
    if (i <= openUntilIndex || i <= cooldownUntilIndex) continue;

    const context = buildContext(candles, zones, i, config);
    if (!context) continue;

    const longCandidate =
      config.direction === "both" || config.direction === "long"
        ? scoreDirection("long", context, config)
        : null;
    const shortCandidate =
      config.direction === "both" || config.direction === "short"
        ? scoreDirection("short", context, config)
        : null;
    const setup = pickBestSetup(longCandidate, shortCandidate, config);
    if (!setup) continue;

    const trade = playTrade(candles.m3, i, setup, context, config);
    if (!trade) continue;

    openUntilIndex = trade.exitIndex;
    consecutiveLosses = trade.rMultiple < 0 ? consecutiveLosses + 1 : 0;
    if (consecutiveLosses >= 3) {
      cooldownUntilIndex = trade.exitIndex + 20;
      consecutiveLosses = 0;
    }

    trades.push({
      id: `D${trades.length + 1}`,
      ...trade
    });
  }

  return trades;
}

function buildContext(candles, zones, m3Index, config) {
  const signalCandle = candles.m3[m3Index];
  const m15Index = findCandleIndexAtOrBefore(candles.m15, signalCandle.time);
  const h4Index = findCandleIndexAtOrBefore(candles.h4, signalCandle.time);
  const dailyIndex = findCandleIndexAtOrBefore(candles.daily, signalCandle.time);
  if (m15Index < config.m15Lookback || h4Index < config.h4Lookback || dailyIndex < 12) {
    return null;
  }

  const dailyBias = detectBias(candles.daily, dailyIndex, 18);
  const weeklyBias =
    candles.weekly.length >= 8
      ? detectBias(
          candles.weekly,
          findCandleIndexAtOrBefore(candles.weekly, signalCandle.time),
          8
        )
      : "neutral";
  const nearestZones = findNearestZones(zones, signalCandle.close, config);
  const h4Setup = detectH4Setup(candles.h4, h4Index, nearestZones, config);
  const m15Trigger = detectM15Trigger(candles.m15, m15Index, nearestZones, config);
  const m3Signals = detectM3Signals(candles.m3, m3Index, config);
  const volumeAverage = averageVolume(candles.m3, m3Index, config.volumeLookback);
  const volumeConfirms =
    volumeAverage > 0 && signalCandle.volume >= volumeAverage * config.volumeMultiplier;
  const chop = isChop(candles.m15, m15Index, config);

  return {
    signalCandle,
    m3Index,
    m15Index,
    h4Index,
    dailyIndex,
    dailyBias,
    weeklyBias,
    nearestZones,
    h4Setup,
    m15Trigger,
    m3Signals,
    volumeConfirms,
    chop
  };
}

function scoreDirection(direction, context, config) {
  const opposite = direction === "long" ? "short" : "long";
  const alignedBias =
    context.dailyBias === direction ||
    (context.dailyBias === "neutral" && context.h4Setup.direction === direction);
  const conflict =
    context.dailyBias === opposite ||
    (context.weeklyBias !== "neutral" &&
      context.dailyBias !== "neutral" &&
      context.weeklyBias !== context.dailyBias);
  const triggerAligned = context.m15Trigger.direction === direction;
  const setupAligned = context.h4Setup.direction === direction;
  const entrySignals = context.m3Signals[direction];
  const zone = direction === "long" ? context.nearestZones.support : context.nearestZones.resistance;
  const opposingZone =
    direction === "long" ? context.nearestZones.resistance : context.nearestZones.support;
  const entryPrice = context.signalCandle.close;
  const stop = resolveStructureStop(direction, context, config);
  if (!stop || !zone) return null;

  const risk = Math.abs(entryPrice - stop.price);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  const targetRoom = opposingZone
    ? Math.abs(opposingZone.price - entryPrice) / risk
    : config.partials.at(-1).r;

  let score = 0;
  const reasons = [];
  const penalties = [];

  if (alignedBias) addScore(30, "daily bias aligned");
  if (setupAligned) addScore(25, context.h4Setup.name);
  if (triggerAligned) addScore(20, context.m15Trigger.name);
  if (entrySignals.bos || entrySignals.sweep) addScore(15, entrySignals.bos ? "m3 BOS" : "m3 sweep reclaim");
  if (entrySignals.engulfing || entrySignals.rejection) {
    addScore(10, entrySignals.engulfing ? "m3 engulfing" : "m3 rejection");
  }
  if (zone.fresh) addScore(10, "fresh HTF zone");
  if (targetRoom >= 3) addScore(10, "clear TP room >= 3R");
  if (context.volumeConfirms) addScore(5, "volume confirms");
  if (conflict) addPenalty(20, "HTF conflict");
  if (context.chop) addPenalty(25, "price inside chop");
  if (targetRoom < 2) addPenalty(20, "too close to opposing zone");
  if (entrySignals.late) addPenalty(15, "late entry after extended move");

  return {
    direction,
    score,
    grade: gradeScore(score),
    setupName: context.h4Setup.name,
    entrySignal: entrySignals.name,
    m15Trigger: context.m15Trigger.name,
    dailyBias: context.dailyBias,
    weeklyBias: context.weeklyBias,
    stop,
    targetRoom,
    reasons,
    penalties
  };

  function addScore(points, reason) {
    score += points;
    reasons.push(reason);
  }

  function addPenalty(points, reason) {
    score -= points;
    penalties.push(reason);
  }
}

function pickBestSetup(longCandidate, shortCandidate, config) {
  const candidates = [longCandidate, shortCandidate].filter(Boolean);
  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best.score >= config.minimumScoreToTrade ? best : null;
}

function playTrade(m3, signalIndex, setup, context, config) {
  const entryCandle = m3[signalIndex];
  if (!entryCandle || !m3[signalIndex + 1]) return null;

  const result = simulateTrade(m3, {
    direction:           setup.direction,
    entryIndex:          signalIndex + 1,  // evaluate from the candle after the signal
    entry:               entryCandle.close, // entered at close of signal candle
    stop:                setup.stop.price,
    partials:            config.partials,
    moveStopToBEAfterTP: 1,
    maxHoldBars:         config.maxHoldBars,
    feePct:              config.feePct ?? 0,
    slippagePct:         config.slippagePct ?? 0
  });
  if (!result) return null;

  return {
    ...result,
    // Restore signal-candle timing (entry happened at signal close, not next-candle open)
    entryIndex:    signalIndex,
    entryTime:     entryCandle.time,
    signalIndex,
    signalTime:    entryCandle.time,
    stop:          setup.stop.price,
    stopMode:      setup.stop.mode,
    stopReference: setup.stop.reference,
    setupName:     setup.setupName,
    score:         setup.score,
    grade:         setup.grade,
    dailyBias:     setup.dailyBias,
    weeklyBias:    setup.weeklyBias,
    h4Setup:       setup.setupName,
    m15Trigger:    setup.m15Trigger,
    entrySignal:   setup.entrySignal,
    reasons:       setup.reasons,
    penalties:     setup.penalties,
    initialRr:     round(setup.targetRoom, 2)
  };
}

function detectBias(candles, index, lookback) {
  const sample = candles.slice(Math.max(0, index - lookback), index + 1);
  if (sample.length < 8) return "neutral";
  const closes = sample.map((candle) => candle.close);
  const firstHalf = closes.slice(0, Math.floor(closes.length / 2));
  const secondHalf = closes.slice(Math.floor(closes.length / 2));
  const firstAverage = average(firstHalf);
  const secondAverage = average(secondHalf);
  const lastClose = closes.at(-1);
  const recentHigh = Math.max(...sample.slice(0, -1).map((candle) => candle.high));
  const recentLow = Math.min(...sample.slice(0, -1).map((candle) => candle.low));

  if (secondAverage > firstAverage && lastClose > recentLow) return "long";
  if (secondAverage < firstAverage && lastClose < recentHigh) return "short";
  return "neutral";
}

function buildZones(h4Candles, config) {
  const pivots = detectPivots(h4Candles, config.swingWindow);
  const zones = [];

  for (const pivot of pivots) {
    const tolerance = pivot.price * (config.levelTolerancePct / 100);
    const existing = zones.find(
      (zone) => zone.type === pivot.type && Math.abs(zone.price - pivot.price) <= tolerance
    );

    if (existing) {
      const touches = existing.touches + 1;
      existing.price = (existing.price * existing.touches + pivot.price) / touches;
      existing.touches = touches;
      existing.lastTouchTime = Math.max(existing.lastTouchTime, pivot.time);
      existing.fresh = false;
      continue;
    }

    zones.push({
      id: `dc-zone-${zones.length + 1}`,
      type: pivot.type,
      price: pivot.price,
      touches: 1,
      firstTouchTime: pivot.time,
      lastTouchTime: pivot.time,
      fresh: true
    });
  }

  return zones
    .map((zone) => ({
      ...zone,
      strength: zone.touches + (zone.fresh ? 1 : 0)
    }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 28);
}

function detectPivots(candles, window) {
  const pivots = [];
  for (let i = window; i < candles.length - window; i += 1) {
    const candle = candles[i];
    const neighbors = [
      ...candles.slice(i - window, i),
      ...candles.slice(i + 1, i + window + 1)
    ];
    if (neighbors.every((item) => candle.low <= item.low)) {
      pivots.push({ type: "support", price: candle.low, time: candle.time, index: i });
    }
    if (neighbors.every((item) => candle.high >= item.high)) {
      pivots.push({ type: "resistance", price: candle.high, time: candle.time, index: i });
    }
  }
  return pivots;
}

function findNearestZones(zones, price, config) {
  const supports = zones
    .filter((zone) => zone.type === "support" && zone.price <= price * (1 + config.levelTolerancePct / 100))
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  const resistances = zones
    .filter((zone) => zone.type === "resistance" && zone.price >= price * (1 - config.levelTolerancePct / 100))
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));

  return {
    support: supports[0] ?? null,
    resistance: resistances[0] ?? null
  };
}

function detectH4Setup(h4, index, zones, config) {
  const candle = h4[index];
  const previous = h4[index - 1];
  const recent = h4.slice(Math.max(0, index - config.h4Lookback), index + 1);
  const supportTouched = zones.support && touchedZone(candle, zones.support, config);
  const resistanceTouched = zones.resistance && touchedZone(candle, zones.resistance, config);
  const bullishRejection = lowerWickPct(candle) >= 45 && candle.close > candle.open;
  const bearishRejection = upperWickPct(candle) >= 45 && candle.close < candle.open;
  const recentHigh = Math.max(...recent.slice(0, -1).map((item) => item.high));
  const recentLow = Math.min(...recent.slice(0, -1).map((item) => item.low));
  const bullishBos = candle.close > recentHigh || (previous && previous.close <= recentHigh && candle.close > previous.high);
  const bearishBos = candle.close < recentLow || (previous && previous.close >= recentLow && candle.close < previous.low);
  const doubleBottom = supportTouched && comparableLows(recent, config);
  const doubleTop = resistanceTouched && comparableHighs(recent, config);

  if ((supportTouched && bullishRejection) || doubleBottom || bullishBos) {
    return {
      direction: "long",
      name: doubleBottom ? "double_bottom_long" : bullishBos ? "v_pattern_long_bos" : "h4_demand_rejection"
    };
  }

  if ((resistanceTouched && bearishRejection) || doubleTop || bearishBos) {
    return {
      direction: "short",
      name: doubleTop ? "double_top_short" : bearishBos ? "v_pattern_short_bos" : "h4_supply_rejection"
    };
  }

  return { direction: "neutral", name: "no_clean_h4_setup" };
}

function detectM15Trigger(m15, index, zones, config) {
  const candle = m15[index];
  const supportTouched = zones.support && touchedZone(candle, zones.support, config);
  const resistanceTouched = zones.resistance && touchedZone(candle, zones.resistance, config);
  const recent = m15.slice(Math.max(0, index - config.m15Lookback), index + 1);
  const recentHigh = Math.max(...recent.slice(0, -1).map((item) => item.high));
  const recentLow = Math.min(...recent.slice(0, -1).map((item) => item.low));

  if ((supportTouched && candle.close > candle.open) || candle.close > recentHigh) {
    return { direction: "long", name: supportTouched ? "m15_retest_holds" : "m15_breakout_confirmed" };
  }

  if ((resistanceTouched && candle.close < candle.open) || candle.close < recentLow) {
    return { direction: "short", name: resistanceTouched ? "m15_retest_holds" : "m15_breakdown_confirmed" };
  }

  return { direction: "neutral", name: "no_m15_trigger" };
}

function detectM3Signals(m3, index, config) {
  const candle = m3[index];
  const previous = m3[index - 1];
  const recent = m3.slice(Math.max(0, index - config.m3Lookback), index + 1);
  const prior = recent.slice(0, -1);
  const localHigh = Math.max(...prior.map((item) => item.high));
  const localLow = Math.min(...prior.map((item) => item.low));
  const recentRange = average(prior.map((item) => item.high - item.low));
  const extendedMove = Math.abs(candle.close - recent[0].open) > recentRange * 6;

  const bullishEngulfing =
    previous &&
    previous.close < previous.open &&
    candle.close > candle.open &&
    candle.close >= previous.open &&
    candle.open <= previous.close;
  const bearishEngulfing =
    previous &&
    previous.close > previous.open &&
    candle.close < candle.open &&
    candle.close <= previous.open &&
    candle.open >= previous.close;

  return {
    long: {
      bos: candle.close > localHigh,
      sweep: candle.low < localLow && candle.close > localLow,
      engulfing: bullishEngulfing,
      rejection: lowerWickPct(candle) >= 45 && candle.close > candle.open,
      late: extendedMove && candle.close > recent[0].open,
      name: signalName({
        bos: candle.close > localHigh,
        sweep: candle.low < localLow && candle.close > localLow,
        engulfing: bullishEngulfing,
        rejection: lowerWickPct(candle) >= 45 && candle.close > candle.open
      })
    },
    short: {
      bos: candle.close < localLow,
      sweep: candle.high > localHigh && candle.close < localHigh,
      engulfing: bearishEngulfing,
      rejection: upperWickPct(candle) >= 45 && candle.close < candle.open,
      late: extendedMove && candle.close < recent[0].open,
      name: signalName({
        bos: candle.close < localLow,
        sweep: candle.high > localHigh && candle.close < localHigh,
        engulfing: bearishEngulfing,
        rejection: upperWickPct(candle) >= 45 && candle.close < candle.open
      })
    }
  };
}

function resolveStructureStop(direction, context, config) {
  const m3 = context.signalCandle;
  const zone = direction === "long" ? context.nearestZones.support : context.nearestZones.resistance;
  if (!zone) return null;
  const buffer = config.stopBufferPct / 100;
  const m3Price = direction === "long" ? m3.low * (1 - buffer) : m3.high * (1 + buffer);
  const zonePrice = direction === "long" ? zone.price * (1 - buffer) : zone.price * (1 + buffer);
  const price = direction === "long" ? Math.min(m3Price, zonePrice) : Math.max(m3Price, zonePrice);

  return {
    price,
    mode: "structure",
    reference: zone.id
  };
}

function touchedZone(candle, zone, config) {
  const tolerance = zone.price * (config.levelTolerancePct / 100);
  return zone.type === "support"
    ? candle.low <= zone.price + tolerance && candle.close >= zone.price - tolerance
    : candle.high >= zone.price - tolerance && candle.close <= zone.price + tolerance;
}

function comparableLows(candles, config) {
  const lows = candles
    .map((candle) => candle.low)
    .sort((a, b) => a - b)
    .slice(0, 2);
  if (lows.length < 2) return false;
  return Math.abs(lows[0] - lows[1]) <= lows[0] * (config.levelTolerancePct / 100);
}

function comparableHighs(candles, config) {
  const highs = candles
    .map((candle) => candle.high)
    .sort((a, b) => b - a)
    .slice(0, 2);
  if (highs.length < 2) return false;
  return Math.abs(highs[0] - highs[1]) <= highs[0] * (config.levelTolerancePct / 100);
}

function isChop(candles, index, config) {
  const sample = candles.slice(Math.max(0, index - 16), index + 1);
  if (sample.length < 10) return false;
  const high = Math.max(...sample.map((candle) => candle.high));
  const low = Math.min(...sample.map((candle) => candle.low));
  const rangePct = ((high - low) / sample.at(-1).close) * 100;
  const directionChanges = sample.reduce((count, candle, sampleIndex) => {
    if (sampleIndex === 0) return 0;
    const previous = sample[sampleIndex - 1];
    return count + (Math.sign(candle.close - candle.open) !== Math.sign(previous.close - previous.open) ? 1 : 0);
  }, 0);
  return rangePct <= config.levelTolerancePct * 2.5 && directionChanges >= sample.length * 0.55;
}

function zoneToLevel(zone) {
  return {
    id: zone.id,
    price: zone.price,
    type: zone.type,
    touches: zone.touches,
    firstTouchTime: zone.firstTouchTime,
    lastTouchTime: zone.lastTouchTime,
    strength: zone.strength
  };
}


function findCandleIndexAtOrBefore(candles, time) {
  let low = 0;
  let high = candles.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid].time <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

function averageVolume(candles, index, lookback) {
  const sample = candles.slice(Math.max(0, index - lookback), index);
  if (!sample.length) return 0;
  return average(sample.map((candle) => candle.volume));
}

function lowerWickPct(candle) {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return ((Math.min(candle.open, candle.close) - candle.low) / range) * 100;
}

function upperWickPct(candle) {
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  return ((candle.high - Math.max(candle.open, candle.close)) / range) * 100;
}

function signalName(signals) {
  if (signals.bos) return "m3_bos";
  if (signals.sweep) return "m3_liquidity_sweep_reclaim";
  if (signals.engulfing) return "m3_engulfing";
  if (signals.rejection) return "m3_rejection";
  return "no_m3_signal";
}

function gradeScore(score) {
  if (score >= 85) return "A_plus";
  if (score >= 75) return "A";
  if (score >= 70) return "B";
  return "no_trade";
}

function normalizeOptions(options) {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...options,
    stopMode: "structure"
  };
  const partialTotal = merged.partials.reduce((sum, partial) => sum + Number(partial.size), 0);

  return {
    ...merged,
    partials: merged.partials.map((partial) => ({
      r: Number(partial.r),
      size: Number(partial.size) / partialTotal
    }))
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

// ─── Live Signal Scanner ──────────────────────────────────────────────────────

export function scanDoopiecashNakedPriceAction({ entryCandles, levelCandles, candlesByResolution = {}, options = {} }) {
  const config = normalizeOptions(options);
  const m3 = candlesByResolution["3m"] ?? entryCandles;
  const h4 = candlesByResolution["4h"] ?? levelCandles;
  const daily = candlesByResolution["1D"] ?? [];
  const weekly = candlesByResolution["1W"] ?? [];

  if (!m3.length) return { setups: [], currentPrice: 0 };

  const currentPrice = m3[m3.length - 1].close;
  const zones = buildZones(h4, config);
  const dailyBias = daily.length >= 8 ? detectBias(daily, daily.length - 1, 14) : "neutral";
  const weeklyBias = weekly.length >= 4 ? detectBias(weekly, weekly.length - 1, 8) : "neutral";

  const tol = currentPrice * (config.levelTolerancePct / 100);
  const supports = zones.filter(z => z.type === "support" && z.price < currentPrice - tol).sort((a, b) => b.price - a.price);
  const resistances = zones.filter(z => z.type === "resistance" && z.price > currentPrice + tol).sort((a, b) => a.price - b.price);

  const setups = [];

  if (supports.length && config.direction !== "short") {
    const zone = supports[0];
    // Stop at next zone below, or 0.7% fixed — stopBufferPct (0.05) is too tight for zone-based entries
    const stopRef = supports[1]?.price ?? zone.price * (1 - 0.7 / 100);
    const stop = round(stopRef * (1 - config.stopBufferPct / 100), 1);
    const risk = zone.price - stop;
    const tp3 = resistances[0]?.price ?? zone.price + risk * 3;
    const biasScore = (dailyBias === "long" ? 35 : dailyBias === "neutral" ? 15 : 0) + (weeklyBias === "long" ? 20 : weeklyBias === "neutral" ? 10 : 0);
    const dist = round((currentPrice - zone.price) / currentPrice * 100, 2);
    const proximity = (currentPrice - zone.price) / tol;

    if (risk > 0) {
      setups.push({
        direction: "long",
        status: proximity <= 4 ? "watch" : "pending",
        entryPrice: round(zone.price, 1),
        stopPrice: stop,
        tp1: round(zone.price + risk, 1),
        tp2: round(zone.price + risk * 2, 1),
        tp3: round(tp3, 1),
        score: Math.min(100, biasScore + 25 + (zone.fresh ? 15 : 5)),
        rr: round((tp3 - zone.price) / risk, 2),
        description: `Dagelijkse bias: ${doopBiasFmt(dailyBias)} · ${zone.touches} touches · H4 demand`,
        distance: `${dist}% onder prijs`
      });
    }
  }

  if (resistances.length && config.direction !== "long") {
    const zone = resistances[0];
    // Stop at next zone above, or 0.7% fixed
    const stopRef = resistances[1]?.price ?? zone.price * (1 + 0.7 / 100);
    const stop = round(stopRef * (1 + config.stopBufferPct / 100), 1);
    const risk = stop - zone.price;
    const tp3 = supports[0]?.price ?? zone.price - risk * 3;
    const biasScore = (dailyBias === "short" ? 35 : dailyBias === "neutral" ? 15 : 0) + (weeklyBias === "short" ? 20 : weeklyBias === "neutral" ? 10 : 0);
    const dist = round((zone.price - currentPrice) / currentPrice * 100, 2);
    const proximity = (zone.price - currentPrice) / tol;

    if (risk > 0) {
      setups.push({
        direction: "short",
        status: proximity <= 4 ? "watch" : "pending",
        entryPrice: round(zone.price, 1),
        stopPrice: stop,
        tp1: round(zone.price - risk, 1),
        tp2: round(zone.price - risk * 2, 1),
        tp3: round(tp3, 1),
        score: Math.min(100, biasScore + 25 + (zone.fresh ? 15 : 5)),
        rr: round((zone.price - tp3) / risk, 2),
        description: `Dagelijkse bias: ${doopBiasFmt(dailyBias)} · ${zone.touches} touches · H4 supply`,
        distance: `${dist}% boven prijs`
      });
    }
  }

  return { setups, currentPrice };
}

function doopBiasFmt(bias) {
  return bias === "long" ? "bullish" : bias === "short" ? "bearish" : "neutraal";
}
